#!/usr/bin/env bash
# Installs WordPress + ACF, activates the Bellaworks Chat plugin, and seeds an
# FAQ page with an ACF repeater. Usage: ./setup.sh <bw_sk_api_key>
set -euo pipefail

API_KEY="${1:?usage: ./setup.sh <bw_sk_api_key>}"
WP() { docker compose exec -T cli wp "$@"; }

echo "waiting for WordPress..."
until WP core is-installed 2>/dev/null || WP core version >/dev/null 2>&1; do sleep 2; done

if ! WP core is-installed 2>/dev/null; then
  WP core install \
    --url=http://localhost:8080 \
    --title="Whitewater Rafting Co." \
    --admin_user=admin --admin_password=admin --admin_email=admin@example.com \
    --skip-email
fi

WP plugin install advanced-custom-fields --activate 2>/dev/null || WP plugin activate advanced-custom-fields
WP plugin activate bellaworks-chat

WP option update bw_chat_settings --format=json "$(cat <<JSON
{
  "api_url": "http://host.docker.internal:3001",
  "client_id": "whitewater",
  "api_key": "${API_KEY}",
  "post_types": ["page", "post"],
  "embed_widget": true,
  "include_acf": true
}
JSON
)"

# Seed a page whose knowledge lives in an ACF FAQ repeater
PAGE_ID=$(WP post list --post_type=page --name=trip-faqs --field=ID | head -1)
if [ -z "$PAGE_ID" ]; then
  PAGE_ID=$(WP post create --post_type=page --post_status=publish \
    --post_title="Trip FAQs" --post_name=trip-faqs \
    --post_content="<h1>Frequently asked questions</h1><p>Answers about our rafting trips.</p>" \
    --porcelain)
fi

WP eval "
update_field('field_bw_faqs', array(
  array('question' => 'Do you allow dogs on rafting trips?', 'answer' => 'Yes! Well-behaved dogs are welcome on our float trips with a doggy life jacket, which we provide free of charge.'),
  array('question' => 'What is the minimum age for rafting?', 'answer' => 'Rafters must be at least 8 years old and able to swim.'),
  array('question' => 'Do you run trips in the rain?', 'answer' => 'Trips run rain or shine. If the river becomes unsafe we cancel and refund in full.'),
), ${PAGE_ID});
BW_Chat_Sync::sync_post(${PAGE_ID});
echo 'seeded page ' . ${PAGE_ID} . PHP_EOL;
"

echo "done. WP admin: http://localhost:8080/wp-admin (admin/admin)"
