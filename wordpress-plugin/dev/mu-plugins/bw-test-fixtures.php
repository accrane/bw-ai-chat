<?php
/**
 * Plugin Name: BW test fixtures
 * Description: Dev-only. Registers an ACF FAQ repeater field group so the sync's ACF handling can be exercised.
 */

add_action( 'acf/init', function () {
	if ( ! function_exists( 'acf_add_local_field_group' ) ) {
		return;
	}
	acf_add_local_field_group( array(
		'key'      => 'group_bw_faqs',
		'title'    => 'FAQs',
		'fields'   => array(
			array(
				'key'   => 'field_bw_intro',
				'name'  => 'intro_text',
				'label' => 'Intro',
				'type'  => 'textarea',
			),
			array(
				'key'   => 'field_bw_hours',
				'name'  => 'office_hours',
				'label' => 'Office hours',
				'type'  => 'text',
			),
			array(
				'key'        => 'field_bw_faqs',
				'name'       => 'faqs',
				'label'      => 'FAQs',
				'type'       => 'repeater',
				'sub_fields' => array(
					array(
						'key'   => 'field_bw_faq_question',
						'name'  => 'question',
						'label' => 'Question',
						'type'  => 'text',
					),
					array(
						'key'   => 'field_bw_faq_answer',
						'name'  => 'answer',
						'label' => 'Answer',
						'type'  => 'textarea',
					),
				),
			),
		),
		'location' => array(
			array(
				array(
					'param'    => 'post_type',
					'operator' => '==',
					'value'    => 'page',
				),
			),
		),
	) );
} );
