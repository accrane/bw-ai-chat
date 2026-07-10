<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'bw_chat_settings' );
delete_option( 'bw_chat_status' );
delete_option( 'bw_chat_sync_queue' );
delete_post_meta_by_key( '_bw_chat_doc_id' );
delete_post_meta_by_key( '_bw_chat_excluded' );
delete_post_meta_by_key( '_bw_chat_synced_at' );
delete_post_meta_by_key( '_bw_chat_error' );
