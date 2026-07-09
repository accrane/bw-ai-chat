=== Bellaworks Chat ===
Contributors: bellaworks
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPL-2.0-or-later

Syncs site content to the Bellaworks AI chat platform and optionally embeds the chat widget.

== Description ==

WordPress publishes content; all AI processing happens on the Bellaworks platform.

* Pushes pages/posts (and selected public post types) on save, in rendered form.
* Advanced Custom Fields support: text/textarea/wysiwyg fields, groups, flexible
  content, and repeaters are harvested. FAQ-style repeater rows (question +
  answer sub-fields) become their own sections so each FAQ is individually
  retrievable by the chat.
* "Exclude from chat" checkbox per post.
* Sync Now button plus daily scheduled reconciliation with orphan cleanup.
* Optional one-checkbox embed of the chat widget in the site footer.

Developers can adjust the synced text per post via the
`bellaworks_chat_post_content` filter:

`add_filter( 'bellaworks_chat_post_content', fn( $content, $post ) => $content, 10, 2 );`

Note: with "Include ACF fields" enabled, all text-bearing ACF values sync —
if a site stores layout-ish text in ACF (button labels etc.), either exclude
those posts or use the filter above to prune.
