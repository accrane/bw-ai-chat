<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Optionally injects the chat widget embed tags into the site footer. */
class BW_Chat_Widget_Embed {

	public static function init() {
		add_action( 'wp_footer', array( __CLASS__, 'render' ) );
	}

	public static function render() {
		$s = BW_Chat_Settings::get();
		if ( empty( $s['embed_widget'] ) || ! $s['api_url'] || ! $s['client_id'] ) {
			return;
		}
		printf(
			'<script src="%s" async></script><bellaworks-chat client-id="%s"></bellaworks-chat>',
			esc_url( $s['api_url'] . '/widget.js' ),
			esc_attr( $s['client_id'] )
		);
	}
}
