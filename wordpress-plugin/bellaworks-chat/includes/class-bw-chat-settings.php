<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Options + the Settings → Bellaworks Chat admin page.
 */
class BW_Chat_Settings {

	const OPTION = 'bw_chat_settings';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
	}

	public static function get() {
		$defaults = array(
			'api_url'      => '',
			'client_id'    => '',
			'api_key'      => '',
			'post_types'   => array( 'page', 'post' ),
			'embed_widget' => false,
			'include_acf'  => true,
		);
		$saved = get_option( self::OPTION, array() );
		return array_merge( $defaults, is_array( $saved ) ? $saved : array() );
	}

	public static function configured() {
		$s = self::get();
		return $s['api_url'] && $s['client_id'] && $s['api_key'];
	}

	public static function admin_menu() {
		add_options_page(
			'Bellaworks Chat',
			'Bellaworks Chat',
			'manage_options',
			'bw-chat',
			array( __CLASS__, 'render_page' )
		);
	}

	public static function register() {
		register_setting( 'bw_chat', self::OPTION, array( 'sanitize_callback' => array( __CLASS__, 'sanitize' ) ) );
	}

	public static function sanitize( $input ) {
		$current = self::get();
		$out     = array(
			'api_url'      => untrailingslashit( esc_url_raw( $input['api_url'] ?? '' ) ),
			'client_id'    => sanitize_key( $input['client_id'] ?? '' ),
			// Blank key field means "keep the stored key" (it is never echoed back).
			'api_key'      => ! empty( $input['api_key'] ) ? sanitize_text_field( $input['api_key'] ) : $current['api_key'],
			'post_types'   => array_values( array_intersect(
				array_map( 'sanitize_key', (array) ( $input['post_types'] ?? array() ) ),
				get_post_types( array( 'public' => true ) )
			) ),
			'embed_widget' => ! empty( $input['embed_widget'] ),
			'include_acf'  => ! empty( $input['include_acf'] ),
		);
		return $out;
	}

	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$s      = self::get();
		$status = BW_Chat_Sync::status();
		$types  = get_post_types( array( 'public' => true ), 'objects' );
		unset( $types['attachment'] );
		// One-shot notice from the document upload/delete handlers.
		$notice   = isset( $_GET['bw_notice'] ) ? sanitize_text_field( rawurldecode( wp_unslash( $_GET['bw_notice'] ) ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only
		$is_error = ! empty( $_GET['bw_error'] ) && '1' === $_GET['bw_error']; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		?>
		<div class="wrap">
			<h1>Bellaworks Chat</h1>
			<?php if ( $notice ) : ?>
				<div class="notice <?php echo $is_error ? 'notice-error' : 'notice-success'; ?> is-dismissible">
					<p><?php echo esc_html( $notice ); ?></p>
				</div>
			<?php endif; ?>
			<form method="post" action="options.php">
				<?php settings_fields( 'bw_chat' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="bw_api_url">API URL</label></th>
						<td><input type="url" id="bw_api_url" class="regular-text" name="<?php echo esc_attr( self::OPTION ); ?>[api_url]" value="<?php echo esc_attr( $s['api_url'] ); ?>" placeholder="https://chat.bellaworks.ai" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="bw_client_id">Client ID</label></th>
						<td><input type="text" id="bw_client_id" class="regular-text" name="<?php echo esc_attr( self::OPTION ); ?>[client_id]" value="<?php echo esc_attr( $s['client_id'] ); ?>" placeholder="whitewater" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="bw_api_key">API Key</label></th>
						<td>
							<input type="password" id="bw_api_key" class="regular-text" name="<?php echo esc_attr( self::OPTION ); ?>[api_key]" value="" autocomplete="new-password" placeholder="<?php echo $s['api_key'] ? esc_attr__( '(stored — leave blank to keep)', 'bw-chat' ) : 'bw_sk_…'; ?>" />
						</td>
					</tr>
					<tr>
						<th scope="row">Sync post types</th>
						<td>
							<?php foreach ( $types as $type ) : ?>
								<label style="display:block">
									<input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[post_types][]" value="<?php echo esc_attr( $type->name ); ?>" <?php checked( in_array( $type->name, $s['post_types'], true ) ); ?> />
									<?php echo esc_html( $type->labels->name ); ?>
								</label>
							<?php endforeach; ?>
						</td>
					</tr>
					<tr>
						<th scope="row">ACF fields</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[include_acf]" value="1" <?php checked( $s['include_acf'] ); ?> />
								Include Advanced Custom Fields content (repeaters such as FAQs, flexible content, text fields)
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row">Chat widget</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[embed_widget]" value="1" <?php checked( $s['embed_widget'] ); ?> />
								Show the floating chat bubble site-wide
							</label>
							<p style="margin-top:8px">
								To place the chat inline on a specific page instead (or additionally),
								paste this shortcode into the page content:
							</p>
							<p>
								<code id="bw-chat-shortcode">[bellaworks_chat]</code>
								<button type="button" class="button button-small" onclick="navigator.clipboard.writeText('[bellaworks_chat]');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)">Copy</button>
							</p>
							<p class="description">
								Optional height: <code>[bellaworks_chat height="600px"]</code>
							</p>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<hr />
			<h2>Sync</h2>
			<p>
				State: <strong><?php echo esc_html( $status['state'] ); ?></strong>
				<?php if ( 'running' === $status['state'] ) : ?>
					— <?php echo esc_html( $status['processed'] ); ?> processed, <?php echo esc_html( $status['queued'] ); ?> remaining
				<?php endif; ?>
				<?php if ( $status['last_sync'] ) : ?>
					| Last full sync: <?php echo esc_html( wp_date( 'Y-m-d H:i', $status['last_sync'] ) ); ?>
				<?php endif; ?>
			</p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="bw_chat_sync" />
				<?php wp_nonce_field( 'bw_chat_sync' ); ?>
				<?php submit_button( 'Sync all content now', 'secondary', 'submit', false, self::configured() ? array() : array( 'disabled' => 'disabled' ) ); ?>
			</form>
			<?php if ( ! empty( $status['errors'] ) ) : ?>
				<h3>Recent sync errors</h3>
				<ul>
					<?php foreach ( $status['errors'] as $err ) : ?>
						<li><strong><?php echo esc_html( $err['title'] ); ?></strong> — <?php echo esc_html( $err['error'] ); ?></li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>

			<?php BW_Chat_Documents::render_section(); ?>
		</div>
		<?php
	}
}
