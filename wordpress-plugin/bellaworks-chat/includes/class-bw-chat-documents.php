<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Off-site knowledge documents: files the client uploads (handbooks, price
 * sheets, policies…) that should inform the chat but do not live on the
 * website. Files are forwarded to the platform's extraction pipeline and
 * never stored in WordPress. Re-uploading the same filename replaces the
 * existing document.
 */
class BW_Chat_Documents {

	const ALLOWED_EXTENSIONS = array( 'pdf', 'docx', 'txt', 'md' );
	const MAX_BYTES          = 10485760; // matches the API's 10 MB cap

	public static function init() {
		add_action( 'admin_post_bw_chat_upload_doc', array( __CLASS__, 'handle_upload' ) );
		add_action( 'admin_post_bw_chat_delete_doc', array( __CLASS__, 'handle_delete' ) );
	}

	private static function back_to_settings( $notice, $is_error = false ) {
		wp_safe_redirect( add_query_arg(
			array(
				'page'      => 'bw-chat',
				'bw_notice' => rawurlencode( $notice ),
				'bw_error'  => $is_error ? '1' : '0',
			),
			admin_url( 'options-general.php' )
		) );
		exit;
	}

	public static function handle_upload() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'forbidden' );
		}
		check_admin_referer( 'bw_chat_upload_doc' );

		$file = $_FILES['bw_chat_file'] ?? null; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- validated below
		if ( ! $file || UPLOAD_ERR_NO_FILE === (int) $file['error'] ) {
			self::back_to_settings( 'Choose a file to upload.', true );
		}
		if ( UPLOAD_ERR_OK !== (int) $file['error'] ) {
			self::back_to_settings( 'Upload failed (error ' . (int) $file['error'] . ').', true );
		}
		if ( (int) $file['size'] > self::MAX_BYTES ) {
			self::back_to_settings( 'File is larger than 10 MB.', true );
		}

		$filename = sanitize_file_name( $file['name'] );
		$ext      = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
		if ( ! in_array( $ext, self::ALLOWED_EXTENSIONS, true ) ) {
			self::back_to_settings( 'Unsupported file type — use PDF, DOCX, TXT, or MD.', true );
		}

		$client = new BW_Chat_API_Client();
		$result = $client->upload_file( $filename, $file['tmp_name'] );
		if ( ! $result['ok'] ) {
			self::back_to_settings( 'Upload failed: ' . $result['error'], true );
		}
		self::back_to_settings( sprintf( '"%s" uploaded — it will be searchable in a moment.', $filename ) );
	}

	public static function handle_delete() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'forbidden' );
		}
		check_admin_referer( 'bw_chat_delete_doc' );

		$doc_id = sanitize_text_field( wp_unslash( $_POST['doc_id'] ?? '' ) );
		if ( ! $doc_id ) {
			self::back_to_settings( 'Missing document id.', true );
		}
		$client = new BW_Chat_API_Client();
		$result = $client->delete_document( $doc_id );
		if ( ! $result['ok'] ) {
			self::back_to_settings( 'Delete failed: ' . $result['error'], true );
		}
		self::back_to_settings( 'Document removed from the chat knowledge base.' );
	}

	/** Settings-page section: upload form + list of non-website documents. */
	public static function render_section() {
		if ( ! BW_Chat_Settings::configured() ) {
			return;
		}
		$client = new BW_Chat_API_Client();
		$result = $client->list_documents( 100 );
		$docs   = array();
		if ( $result['ok'] ) {
			foreach ( $result['data']['documents'] ?? array() as $doc ) {
				if ( 'wordpress' !== $doc['sourceType'] ) {
					$docs[] = $doc;
				}
			}
		}
		?>
		<hr />
		<h2>Documents</h2>
		<p class="description">
			Upload content that should inform the chat but is not on the website — handbooks,
			price sheets, policies. PDF, Word (.docx), text, or markdown, up to 10&nbsp;MB.
			Re-uploading a file with the same name replaces it.
		</p>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data" style="margin:12px 0">
			<input type="hidden" name="action" value="bw_chat_upload_doc" />
			<?php wp_nonce_field( 'bw_chat_upload_doc' ); ?>
			<input type="file" name="bw_chat_file" accept=".pdf,.docx,.txt,.md" required />
			<?php submit_button( 'Upload to chat knowledge', 'secondary', 'submit', false ); ?>
		</form>
		<?php if ( ! $result['ok'] ) : ?>
			<p style="color:#b32d2e">Could not load documents: <?php echo esc_html( $result['error'] ); ?></p>
		<?php elseif ( $docs ) : ?>
			<table class="widefat striped" style="max-width:720px">
				<thead>
					<tr><th>Title</th><th>Type</th><th>Status</th><th>Updated</th><th></th></tr>
				</thead>
				<tbody>
					<?php foreach ( $docs as $doc ) : ?>
						<tr>
							<td>
								<?php echo esc_html( $doc['title'] ); ?>
								<?php if ( ! empty( $doc['error'] ) ) : ?>
									<br /><span style="color:#b32d2e"><?php echo esc_html( $doc['error'] ); ?></span>
								<?php endif; ?>
							</td>
							<td><?php echo esc_html( $doc['sourceType'] ); ?></td>
							<td><?php echo esc_html( $doc['status'] ); ?></td>
							<td><?php echo esc_html( substr( (string) $doc['updatedAt'], 0, 10 ) ); ?></td>
							<td>
								<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" onsubmit="return confirm('Remove this document from the chat knowledge base?')">
									<input type="hidden" name="action" value="bw_chat_delete_doc" />
									<input type="hidden" name="doc_id" value="<?php echo esc_attr( $doc['id'] ); ?>" />
									<?php wp_nonce_field( 'bw_chat_delete_doc' ); ?>
									<?php submit_button( 'Remove', 'link-delete', 'submit', false ); ?>
								</form>
							</td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		<?php else : ?>
			<p class="description">No uploaded documents yet.</p>
		<?php endif; ?>
		<?php
	}
}
