<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Thin wrapper over the Bellaworks knowledge API. Server-to-server only; the
 * API key never reaches the browser.
 */
class BW_Chat_API_Client {

	private $api_url;
	private $api_key;

	public function __construct() {
		$s             = BW_Chat_Settings::get();
		$this->api_url = $s['api_url'];
		$this->api_key = $s['api_key'];
	}

	/**
	 * @return array{ok: bool, data?: array, error?: string, status?: int}
	 */
	private function request( $method, $path, $body = null ) {
		$args = array(
			'method'  => $method,
			'timeout' => 30,
			'headers' => array(
				'Authorization' => 'Bearer ' . $this->api_key,
				'Content-Type'  => 'application/json',
			),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}
		$response = wp_remote_request( $this->api_url . $path, $args );
		if ( is_wp_error( $response ) ) {
			return array(
				'ok'    => false,
				'error' => $response->get_error_message(),
			);
		}
		$status  = wp_remote_retrieve_response_code( $response );
		$decoded = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $status >= 200 && $status < 300 || 204 === $status ) {
			return array(
				'ok'     => true,
				'status' => $status,
				'data'   => is_array( $decoded ) ? $decoded : array(),
			);
		}
		$message = is_array( $decoded ) && isset( $decoded['error']['message'] )
			? $decoded['error']['message']
			: "HTTP {$status}";
		return array(
			'ok'     => false,
			'status' => $status,
			'error'  => $message,
		);
	}

	public function ingest( $source_id, $title, $url, $content ) {
		return $this->request( 'POST', '/v1/knowledge/documents', array(
			'sourceType' => 'wordpress',
			'sourceId'   => (string) $source_id,
			'title'      => $title,
			'url'        => $url,
			'content'    => $content,
		) );
	}

	public function delete_document( $document_id ) {
		return $this->request( 'DELETE', '/v1/knowledge/documents/' . rawurlencode( $document_id ) );
	}

	public function list_wordpress_documents( $limit = 100, $offset = 0 ) {
		return $this->request(
			'GET',
			'/v1/knowledge/documents?sourceType=wordpress&limit=' . (int) $limit . '&offset=' . (int) $offset
		);
	}
}
