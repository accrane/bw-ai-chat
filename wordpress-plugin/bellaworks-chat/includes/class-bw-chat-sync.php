<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Sync engine. Pushes happen on the `shutdown` hook so ACF field values are
 * always saved before content is read (save_post fires before ACF persists
 * its fields). Full reconciliation runs in WP-Cron batches so shared hosting
 * never times out; the platform's content hashing makes unchanged re-pushes
 * nearly free.
 */
class BW_Chat_Sync {

	const STATUS_OPTION = 'bw_chat_status';
	const QUEUE_OPTION  = 'bw_chat_sync_queue';
	const BATCH_SIZE    = 25;
	const META_DOC_ID   = '_bw_chat_doc_id';
	const META_EXCLUDED = '_bw_chat_excluded';

	private static $pending = array();

	public static function init() {
		add_action( 'save_post', array( __CLASS__, 'on_save' ), 99, 2 );
		// ACF saves field values after save_post; this re-queues (deduped).
		add_action( 'acf/save_post', array( __CLASS__, 'on_acf_save' ), 20 );
		add_action( 'wp_trash_post', array( __CLASS__, 'on_remove' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'on_remove' ) );
		add_action( 'shutdown', array( __CLASS__, 'flush_pending' ) );

		add_action( 'bw_chat_process_batch', array( __CLASS__, 'process_batch' ) );
		add_action( 'bw_chat_daily_sync', array( __CLASS__, 'reconcile_start' ) );
		add_action( 'admin_post_bw_chat_sync', array( __CLASS__, 'handle_sync_now' ) );
	}

	public static function activate() {
		if ( ! wp_next_scheduled( 'bw_chat_daily_sync' ) ) {
			wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'bw_chat_daily_sync' );
		}
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'bw_chat_daily_sync' );
		wp_clear_scheduled_hook( 'bw_chat_process_batch' );
	}

	public static function status() {
		$defaults = array(
			'state'     => 'idle',
			'queued'    => 0,
			'processed' => 0,
			'errors'    => array(),
			'last_sync' => 0,
		);
		$saved = get_option( self::STATUS_OPTION, array() );
		return array_merge( $defaults, is_array( $saved ) ? $saved : array() );
	}

	// ---- push-on-save ------------------------------------------------------

	public static function on_save( $post_id, $post ) {
		if ( wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) ) {
			return;
		}
		self::queue( $post_id );
	}

	public static function on_acf_save( $post_id ) {
		if ( is_numeric( $post_id ) ) {
			self::queue( (int) $post_id );
		}
	}

	public static function on_remove( $post_id ) {
		if ( ! self::syncable_type( get_post_type( $post_id ) ) ) {
			return;
		}
		self::delete_remote( $post_id );
		unset( self::$pending[ $post_id ] );
	}

	private static function queue( $post_id ) {
		if ( ! BW_Chat_Settings::configured() ) {
			return;
		}
		if ( ! self::syncable_type( get_post_type( $post_id ) ) ) {
			return;
		}
		self::$pending[ $post_id ] = true;
	}

	public static function flush_pending() {
		foreach ( array_keys( self::$pending ) as $post_id ) {
			self::sync_post( $post_id );
		}
		self::$pending = array();
	}

	// ---- the actual sync of one post --------------------------------------

	public static function sync_post( $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post || ! self::syncable_type( $post->post_type ) ) {
			return false;
		}

		$excluded = (bool) get_post_meta( $post_id, self::META_EXCLUDED, true );
		if ( 'publish' !== $post->post_status || $excluded ) {
			self::delete_remote( $post_id );
			return true;
		}

		$extracted = BW_Chat_Content_Extractor::extract( $post );
		if ( '' === $extracted['content'] ) {
			self::delete_remote( $post_id );
			return true;
		}

		$client = new BW_Chat_API_Client();
		$result = $client->ingest( $post_id, $extracted['title'], $extracted['url'], $extracted['content'] );
		if ( $result['ok'] ) {
			if ( isset( $result['data']['document']['id'] ) ) {
				update_post_meta( $post_id, self::META_DOC_ID, $result['data']['document']['id'] );
			}
			update_post_meta( $post_id, '_bw_chat_synced_at', time() );
			delete_post_meta( $post_id, '_bw_chat_error' );
			return true;
		}

		update_post_meta( $post_id, '_bw_chat_error', $result['error'] );
		self::record_error( $post->post_title, $result['error'] );
		return false;
	}

	private static function delete_remote( $post_id ) {
		$doc_id = get_post_meta( $post_id, self::META_DOC_ID, true );
		if ( ! $doc_id || ! BW_Chat_Settings::configured() ) {
			return;
		}
		$client = new BW_Chat_API_Client();
		$result = $client->delete_document( $doc_id );
		if ( $result['ok'] || 404 === ( $result['status'] ?? 0 ) ) {
			delete_post_meta( $post_id, self::META_DOC_ID );
		}
	}

	// ---- full reconciliation (Sync Now + daily cron) -----------------------

	public static function handle_sync_now() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'forbidden' );
		}
		check_admin_referer( 'bw_chat_sync' );
		self::reconcile_start();
		wp_safe_redirect( admin_url( 'options-general.php?page=bw-chat' ) );
		exit;
	}

	public static function reconcile_start() {
		if ( ! BW_Chat_Settings::configured() ) {
			return;
		}
		$ids = get_posts( array(
			'post_type'      => BW_Chat_Settings::get()['post_types'],
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );
		update_option( self::QUEUE_OPTION, array_map( 'intval', $ids ), false );
		update_option( self::STATUS_OPTION, array_merge( self::status(), array(
			'state'     => 'running',
			'queued'    => count( $ids ),
			'processed' => 0,
			'errors'    => array(),
		) ), false );
		if ( ! wp_next_scheduled( 'bw_chat_process_batch' ) ) {
			wp_schedule_single_event( time(), 'bw_chat_process_batch' );
		}
	}

	public static function process_batch() {
		$queue = get_option( self::QUEUE_OPTION, array() );
		$batch = array_splice( $queue, 0, self::BATCH_SIZE );

		foreach ( $batch as $post_id ) {
			self::sync_post( $post_id );
		}

		$status              = self::status();
		$status['processed'] = $status['processed'] + count( $batch );
		$status['queued']    = count( $queue );

		if ( $queue ) {
			update_option( self::QUEUE_OPTION, $queue, false );
			update_option( self::STATUS_OPTION, $status, false );
			wp_schedule_single_event( time() + 5, 'bw_chat_process_batch' );
			return;
		}

		self::cleanup_orphans();
		delete_option( self::QUEUE_OPTION );
		$status['state']     = 'idle';
		$status['last_sync'] = time();
		update_option( self::STATUS_OPTION, $status, false );
	}

	/** Deletes platform documents whose WordPress post no longer qualifies. */
	private static function cleanup_orphans() {
		$client = new BW_Chat_API_Client();
		$valid  = array();
		$posts  = get_posts( array(
			'post_type'      => BW_Chat_Settings::get()['post_types'],
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );
		foreach ( $posts as $post_id ) {
			if ( ! get_post_meta( $post_id, self::META_EXCLUDED, true ) ) {
				$valid[ (string) $post_id ] = true;
			}
		}

		$offset = 0;
		do {
			$result = $client->list_wordpress_documents( 100, $offset );
			if ( ! $result['ok'] ) {
				return;
			}
			$documents = $result['data']['documents'] ?? array();
			foreach ( $documents as $doc ) {
				if ( ! isset( $valid[ $doc['sourceId'] ] ) ) {
					$client->delete_document( $doc['id'] );
				}
			}
			$offset += 100;
			$total   = (int) ( $result['data']['total'] ?? 0 );
		} while ( $offset < $total );
	}

	// ---- helpers -----------------------------------------------------------

	private static function syncable_type( $type ) {
		return $type && in_array( $type, BW_Chat_Settings::get()['post_types'], true );
	}

	private static function record_error( $title, $error ) {
		$status             = self::status();
		$status['errors']   = array_slice( array_merge( array(
			array(
				'title' => $title,
				'error' => $error,
				'time'  => time(),
			),
		), $status['errors'] ), 0, 10 );
		update_option( self::STATUS_OPTION, $status, false );
	}
}
