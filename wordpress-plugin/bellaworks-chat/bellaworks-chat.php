<?php
/**
 * Plugin Name: Bellaworks Chat
 * Description: Syncs site content (including ACF fields) to the Bellaworks AI chat platform and optionally embeds the chat widget.
 * Version: 0.1.0
 * Author: Bellaworks Web Design
 * License: GPL-2.0-or-later
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BW_CHAT_VERSION', '0.1.0' );
define( 'BW_CHAT_DIR', plugin_dir_path( __FILE__ ) );

require_once BW_CHAT_DIR . 'includes/class-bw-chat-settings.php';
require_once BW_CHAT_DIR . 'includes/class-bw-chat-api-client.php';
require_once BW_CHAT_DIR . 'includes/class-bw-chat-content-extractor.php';
require_once BW_CHAT_DIR . 'includes/class-bw-chat-sync.php';
require_once BW_CHAT_DIR . 'includes/class-bw-chat-meta-box.php';
require_once BW_CHAT_DIR . 'includes/class-bw-chat-widget-embed.php';
require_once BW_CHAT_DIR . 'includes/class-bw-chat-documents.php';

BW_Chat_Settings::init();
BW_Chat_Sync::init();
BW_Chat_Meta_Box::init();
BW_Chat_Widget_Embed::init();
BW_Chat_Documents::init();

register_activation_hook( __FILE__, array( 'BW_Chat_Sync', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'BW_Chat_Sync', 'deactivate' ) );
