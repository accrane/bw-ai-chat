<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Widget embedding: the optional site-wide floating bubble (wp_footer), and
 * the [bw_ai_chat] shortcode for an inline chat panel placed anywhere in
 * page content. The two are independent — a site can use either or both, and
 * they share the visitor's conversation session.
 */
class BW_Chat_Widget_Embed {

	private static $loader_printed = false;

	public static function init() {
		add_action( 'wp_footer', array( __CLASS__, 'render_floating' ) );
		add_shortcode( 'bw_ai_chat', array( __CLASS__, 'shortcode' ) );
	}

	private static function loader_tag( $settings ) {
		if ( self::$loader_printed ) {
			return '';
		}
		self::$loader_printed = true;
		// The loader itself also guards against double-loading.
		return sprintf( '<script src="%s" async></script>', esc_url( $settings['api_url'] . '/widget.js' ) );
	}

	public static function render_floating() {
		$s = BW_Chat_Settings::get();
		if ( empty( $s['embed_widget'] ) || ! $s['api_url'] || ! $s['client_id'] ) {
			return;
		}
		printf(
			'%s<bw-ai-chat client-id="%s"></bw-ai-chat>',
			self::loader_tag( $s ), // phpcs:ignore WordPress.Security.EscapeOutput -- built from esc_url
			esc_attr( $s['client_id'] )
		);
	}

	/** [bw_ai_chat height="520px"] — inline chat panel in page content. */
	public static function shortcode( $atts ) {
		$s = BW_Chat_Settings::get();
		if ( ! $s['api_url'] || ! $s['client_id'] ) {
			return current_user_can( 'manage_options' )
				? '<p><em>BW AI Chat: configure the API URL and Client ID under Settings → BW AI Chat.</em></p>'
				: '';
		}
		$atts   = shortcode_atts( array( 'height' => '' ), $atts, 'bw_ai_chat' );
		$height = preg_match( '/^\d+(px|rem|em|vh|%)$/', (string) $atts['height'] ) ? $atts['height'] : '';
		return sprintf(
			'%s<bw-ai-chat client-id="%s" inline%s></bw-ai-chat>',
			self::loader_tag( $s ), // phpcs:ignore WordPress.Security.EscapeOutput -- built from esc_url
			esc_attr( $s['client_id'] ),
			$height ? ' style="--bw-inline-height:' . esc_attr( $height ) . '"' : ''
		);
	}
}
