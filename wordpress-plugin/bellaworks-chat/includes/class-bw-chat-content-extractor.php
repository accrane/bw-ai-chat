<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Turns a post into the markdown-ish text the platform chunker expects.
 * Headings survive as `#` markers so the server keeps heading-aware chunks
 * (and citations). ACF content — most importantly FAQ-style repeaters — is
 * harvested alongside the main content; each question/answer row becomes a
 * `## Question` section, which the chunker turns into its own retrievable
 * chunk titled by the question.
 */
class BW_Chat_Content_Extractor {

	// Sub-field names (matched case-insensitively, substring) that identify
	// the "question" and "answer" halves of an FAQ-style repeater row.
	const QUESTION_KEYS = array( 'question', 'title', 'heading', 'label' );
	const ANSWER_KEYS   = array( 'answer', 'content', 'text', 'description', 'body' );

	/**
	 * @return array{title: string, url: string, content: string}
	 */
	public static function extract( $post ) {
		$settings = BW_Chat_Settings::get();

		$rendered = apply_filters( 'the_content', $post->post_content );
		$parts    = array( self::html_to_text( $rendered ) );

		if ( $settings['include_acf'] && function_exists( 'get_field_objects' ) ) {
			$parts[] = self::acf_text( $post->ID );
		}

		$content = trim( implode( "\n\n", array_filter( $parts ) ) );

		/**
		 * Filter the synced text for a post — the hook for site-specific
		 * content (page-builder output, custom tables, etc.).
		 *
		 * @param string  $content Markdown-ish text about to be synced.
		 * @param WP_Post $post    The post being synced.
		 */
		$content = apply_filters( 'bellaworks_chat_post_content', $content, $post );

		return array(
			'title'   => html_entity_decode( get_the_title( $post ), ENT_QUOTES ),
			'url'     => get_permalink( $post ),
			'content' => $content,
		);
	}

	public static function html_to_text( $html ) {
		$html = (string) $html;
		if ( '' === trim( $html ) ) {
			return '';
		}
		$html = preg_replace_callback(
			'/<h([1-6])[^>]*>(.*?)<\/h\1>/is',
			function ( $m ) {
				return "\n\n" . str_repeat( '#', (int) $m[1] ) . ' ' . wp_strip_all_tags( $m[2] ) . "\n\n";
			},
			$html
		);
		$html = preg_replace( '/<li[^>]*>/i', "\n- ", $html );
		$html = preg_replace( '/<br\s*\/?\s*>/i', "\n", $html );
		$html = preg_replace( '/<\/(p|div|ul|ol|blockquote|table|tr|section|article|figure)>/i', "\n\n", $html );
		$html = preg_replace( '/<(script|style)[^>]*>.*?<\/\1>/is', '', $html );

		$text = wp_strip_all_tags( $html );
		$text = html_entity_decode( $text, ENT_QUOTES | ENT_HTML5 );
		$text = preg_replace( "/[ \t]+/", ' ', $text );
		$text = preg_replace( "/ ?\n ?/", "\n", $text );
		$text = preg_replace( "/\n{3,}/", "\n\n", $text );
		return trim( $text );
	}

	/** All ACF field content for a post, rendered as markdown-ish text. */
	public static function acf_text( $post_id ) {
		$fields = get_field_objects( $post_id );
		if ( ! is_array( $fields ) ) {
			return '';
		}
		$out = array();
		foreach ( $fields as $field ) {
			$rendered = self::render_field( $field );
			if ( '' !== $rendered ) {
				$out[] = $rendered;
			}
		}
		return implode( "\n\n", $out );
	}

	private static function render_field( $field ) {
		$type  = $field['type'] ?? '';
		$label = trim( (string) ( $field['label'] ?? '' ) );
		$value = $field['value'] ?? null;

		if ( null === $value || '' === $value || array() === $value ) {
			return '';
		}

		switch ( $type ) {
			case 'wysiwyg':
				$body = self::html_to_text( $value );
				return '' === $body ? '' : ( $label ? "## {$label}\n\n{$body}" : $body );

			case 'repeater':
				return self::render_rows( (array) $value, $label, $field['sub_fields'] ?? array() );

			case 'group':
				return self::render_rows( array( (array) $value ), $label, $field['sub_fields'] ?? array() );

			case 'flexible_content':
				$rows = array();
				foreach ( (array) $value as $layout_row ) {
					if ( is_array( $layout_row ) ) {
						unset( $layout_row['acf_fc_layout'] );
						$rows[] = $layout_row;
					}
				}
				return self::render_rows( $rows, $label, array() );

			case 'true_false':
			case 'image':
			case 'file':
			case 'gallery':
			case 'relationship':
			case 'post_object':
			case 'page_link':
			case 'user':
			case 'color_picker':
				return ''; // layout/media settings, not knowledge

			default:
				$flat = self::flatten( $value );
				return '' === $flat ? '' : ( $label ? "{$label}: {$flat}" : $flat );
		}
	}

	/**
	 * Rows from a repeater/group/flexible field. FAQ-shaped rows (a question
	 * key + an answer key) become `## Question` sections; anything else
	 * degrades to "Label: value" lines.
	 */
	private static function render_rows( $rows, $label, $sub_fields ) {
		$labels = array();
		foreach ( (array) $sub_fields as $sf ) {
			if ( isset( $sf['name'] ) ) {
				$labels[ $sf['name'] ] = $sf['label'] ?? $sf['name'];
			}
		}

		$sections = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$question = self::pick( $row, self::QUESTION_KEYS );
			$answer   = self::pick( $row, self::ANSWER_KEYS );
			if ( null !== $question && null !== $answer ) {
				$q = self::flatten( $question );
				$a = self::flatten( $answer, true );
				if ( '' !== $q && '' !== $a ) {
					$sections[] = "## {$q}\n\n{$a}";
					continue;
				}
			}
			$lines = array();
			foreach ( $row as $name => $v ) {
				$flat = self::flatten( $v, true );
				if ( '' === $flat ) {
					continue;
				}
				$lines[] = ( $labels[ $name ] ?? ucwords( str_replace( '_', ' ', (string) $name ) ) ) . ': ' . $flat;
			}
			if ( $lines ) {
				$sections[] = implode( "\n", $lines );
			}
		}

		if ( ! $sections ) {
			return '';
		}
		$body = implode( "\n\n", $sections );
		return $label ? "# {$label}\n\n{$body}" : $body;
	}

	/** First row value whose key matches one of $candidates (ci substring). */
	private static function pick( $row, $candidates ) {
		foreach ( $row as $key => $value ) {
			$key_lc = strtolower( (string) $key );
			foreach ( $candidates as $candidate ) {
				if ( false !== strpos( $key_lc, $candidate ) ) {
					if ( null !== $value && '' !== $value ) {
						return $value;
					}
				}
			}
		}
		return null;
	}

	/** Any ACF value → plain text. */
	private static function flatten( $value, $allow_html = false ) {
		if ( is_string( $value ) ) {
			return $allow_html && false !== strpos( $value, '<' )
				? self::html_to_text( $value )
				: trim( wp_strip_all_tags( $value ) );
		}
		if ( is_numeric( $value ) ) {
			return (string) $value;
		}
		if ( is_array( $value ) ) {
			$parts = array();
			foreach ( $value as $v ) {
				$flat = self::flatten( $v, $allow_html );
				if ( '' !== $flat ) {
					$parts[] = $flat;
				}
			}
			return implode( ', ', $parts );
		}
		return '';
	}
}
