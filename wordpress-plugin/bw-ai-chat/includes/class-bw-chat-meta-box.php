<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** "Exclude from chat" checkbox on synced post types. */
class BW_Chat_Meta_Box {

	public static function init() {
		add_action( 'add_meta_boxes', array( __CLASS__, 'register' ) );
		add_action( 'save_post', array( __CLASS__, 'save' ), 10 );
	}

	public static function register() {
		add_meta_box(
			'bw-chat-exclude',
			'BW AI Chat',
			array( __CLASS__, 'render' ),
			BW_Chat_Settings::get()['post_types'],
			'side'
		);
	}

	public static function render( $post ) {
		$excluded = (bool) get_post_meta( $post->ID, BW_Chat_Sync::META_EXCLUDED, true );
		wp_nonce_field( 'bw_chat_exclude', 'bw_chat_exclude_nonce' );
		?>
		<label>
			<input type="checkbox" name="bw_chat_excluded" value="1" <?php checked( $excluded ); ?> />
			Exclude this content from the chat knowledge base
		</label>
		<?php
		$synced = get_post_meta( $post->ID, '_bw_chat_synced_at', true );
		$error  = get_post_meta( $post->ID, '_bw_chat_error', true );
		if ( $error ) {
			echo '<p style="color:#b32d2e">Last sync failed: ' . esc_html( $error ) . '</p>';
		} elseif ( $synced ) {
			echo '<p>Synced ' . esc_html( wp_date( 'Y-m-d H:i', (int) $synced ) ) . '</p>';
		}
	}

	public static function save( $post_id ) {
		if ( ! isset( $_POST['bw_chat_exclude_nonce'] )
			|| ! wp_verify_nonce( sanitize_key( $_POST['bw_chat_exclude_nonce'] ), 'bw_chat_exclude' )
			|| ! current_user_can( 'edit_post', $post_id )
		) {
			return;
		}
		if ( ! empty( $_POST['bw_chat_excluded'] ) ) {
			update_post_meta( $post_id, BW_Chat_Sync::META_EXCLUDED, '1' );
		} else {
			delete_post_meta( $post_id, BW_Chat_Sync::META_EXCLUDED );
		}
	}
}
