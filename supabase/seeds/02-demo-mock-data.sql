-- Capstone demo seed data (all fake)
-- Creates demo agent, calls, report cards, analytics, disputes, and coaching sessions.

DO $$
DECLARE
    v_jake_id UUID;
    v_manager_id UUID;
    v_call_id UUID;
    v_report_id UUID;
    v_call_ids UUID[] := ARRAY[]::UUID[];
    v_i INTEGER;
BEGIN
    -- Ensure demo auth user exists (allows login as Jake)
    SELECT id INTO v_jake_id
    FROM auth.users
    WHERE email = 'jake.hart@tlc.test'
    LIMIT 1;

    IF v_jake_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            extensions.uuid_generate_v4(),
            'authenticated',
            'authenticated',
            'jake.hart@tlc.test',
            extensions.crypt('password123', extensions.gen_salt('bf')),
            current_timestamp,
            current_timestamp,
            current_timestamp,
            '{"provider":"email","providers":["email"]}',
            '{"role":"ccm"}',
            current_timestamp,
            current_timestamp,
            '',
            '',
            '',
            ''
        )
        RETURNING id INTO v_jake_id;
    END IF;

    -- Ensure profile exists/updated for demo user
    INSERT INTO profiles (id, email, first_name, last_name, team, role)
    VALUES (
        v_jake_id,
        'jake.hart@tlc.test',
        'Jake',
        'Hart',
        'TLC Care Team',
        'ccm'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        team = EXCLUDED.team,
        role = EXCLUDED.role;

    -- Get a manager for approvals/reviews
    SELECT id INTO v_manager_id
    FROM profiles
    WHERE role IN ('admin', 'manager')
    LIMIT 1;

    -- If no manager exists, use Jake's ID for now
    IF v_manager_id IS NULL THEN
        v_manager_id := v_jake_id;
    END IF;

    -- ============================================
    -- Create Sample Calls (30 calls over past 30 days)
    -- ============================================
    FOR v_i IN 1..30 LOOP
        INSERT INTO calls (
            id,
            user_id,
            call_id,
            campaign_name,
            call_type,
            call_start_time,
            call_end_time,
            call_duration_seconds,
            recording_url,
            transcript_text,
            customer_phone,
            customer_name,
            disposition,
            status,
            is_bookmarked,
            notes
        ) VALUES (
            gen_random_uuid(),
            v_jake_id,
            'FIVE9-' || TO_CHAR(NOW() - (v_i || ' days')::INTERVAL, 'YYYYMMDD') || '-' || LPAD(v_i::TEXT, 4, '0'),
            CASE (v_i % 4)
                WHEN 0 THEN 'Inbound Collections'
                WHEN 1 THEN 'Outbound Collections'
                WHEN 2 THEN 'Payment Reminder'
                ELSE 'Customer Service'
            END,
            CASE WHEN v_i % 3 = 0 THEN 'inbound' ELSE 'outbound' END,
            NOW() - (v_i || ' days')::INTERVAL + (RANDOM() * INTERVAL '8 hours'),
            NOW() - (v_i || ' days')::INTERVAL + (RANDOM() * INTERVAL '8 hours') + ((180 + RANDOM() * 600)::INTEGER || ' seconds')::INTERVAL,
            180 + (RANDOM() * 600)::INTEGER,
            'https://recordings.five9.com/demo/' || v_i,
            CASE (v_i % 5)
                WHEN 0 THEN 'Agent: Thank you for calling TLC Care Team, this call may be recorded for quality assurance. My name is Jake, how can I help you today?
Customer: Hi, I received a notice about my account and I''m not sure what it''s about.
Agent: I''d be happy to help you with that. For security purposes, can you please verify your date of birth and the last four digits of your social security number?
Customer: Sure, it''s March 15, 1985 and 4532.
Agent: Thank you for verifying that. I can see your account here. There''s a balance of $847.50 that became past due. I understand this can be stressful. What I can do is work with you on a payment arrangement that fits your budget.
Customer: That would be helpful. I''ve been dealing with some unexpected medical expenses.
Agent: I completely understand - life happens and we''re here to help find a solution. Let me see what options we have. Would a payment plan of $100 per month work for you?
Customer: Yes, I think I can manage that.
Agent: Perfect. I''ve set that up for you. Your first payment of $100 will be due on the 15th. Is there anything else I can help you with today?
Customer: No, that''s all. Thank you for being so understanding.
Agent: You''re welcome! Have a great day and thank you for calling TLC.'
                WHEN 1 THEN 'Agent: Good morning, this is Jake calling from TLC Care Team. This call may be recorded for quality and training purposes. This is an attempt to collect a debt and any information obtained will be used for that purpose. Am I speaking with John Smith?
Customer: Yes, this is John.
Agent: Hi John, I''m calling regarding your account. I wanted to reach out because we have some payment options that might work well for your situation. Do you have a moment to discuss?
Customer: Look, I''ve been meaning to call. Things have been tight lately.
Agent: I hear you, and I appreciate you being upfront with me. We definitely want to work with you. Can you tell me a little about your current situation so I can find the best solution?
Customer: I lost my job two months ago but just started a new one. Money is still catching up.
Agent: Congratulations on the new job! That''s great news. Given your situation, I can offer a reduced payment plan to help you get back on track. How does $75 per month sound to start?
Customer: That sounds doable. Thank you for working with me.
Agent: Absolutely, that''s what we''re here for. Let me get this set up for you right now.'
                WHEN 2 THEN 'Agent: Hello, this is Jake with TLC Care Team calling for Sarah Johnson. This call may be recorded.
Customer: This is Sarah.
Agent: Hi Sarah, this is an attempt to collect a debt. I''m calling about your account balance. Before we continue, can you verify your address for me?
Customer: Yes, it''s 123 Main Street, Apartment 4B.
Agent: Thank you. I see there''s a payment due. Were you aware of this?
Customer: I thought I paid that already. Can you check?
Agent: Let me look into that for you... I do see a payment from last month, but there was an additional amount that came through after. The current balance is $325.
Customer: Oh, I see. Can I pay that now?
Agent: Of course! I can take that payment right over the phone. What method would you prefer - debit card or checking account?
Customer: Debit card please.
Agent: Perfect, let me get that set up for you. And thank you for resolving this so quickly!'
                WHEN 3 THEN 'Agent: TLC Care Team, this is Jake speaking. How may I assist you today?
Customer: I need to make a payment on my account.
Agent: I''d be happy to help with that. This call may be recorded for quality assurance. Can you provide your account number or the phone number on the account?
Customer: The phone number is 555-123-4567.
Agent: Thank you. I found your account. I see you have a balance of $450. Would you like to pay the full amount or make a partial payment today?
Customer: I want to pay $200 today and the rest next week.
Agent: That works perfectly. Let me set that up. After today''s payment of $200, you''ll have a remaining balance of $250. Would you like me to schedule the follow-up payment for next week?
Customer: Yes, please schedule it for Friday.
Agent: Done! You''ll receive a confirmation email. Is there anything else I can help you with?
Customer: No, that''s all. Thanks!'
                ELSE 'Agent: Thank you for calling TLC Care Team. This call may be recorded for quality purposes. My name is Jake, how can I help?
Customer: I have a question about my statement.
Agent: Of course, I''d be happy to help clarify anything. Can you verify your identity first?
Customer: Sure, my name is Michael Brown, DOB 7/22/1980.
Agent: Thank you Michael. What questions do you have about your statement?
Customer: There''s a charge I don''t recognize for $150.
Agent: Let me look into that for you. I can see that charge was from your original agreement. It was a processing fee that was disclosed in your initial paperwork. Would you like me to email you a copy of that document?
Customer: Oh, I see. Yes, please send that over.
Agent: Absolutely, I''ll send that right away. Is there anything else you need today?
Customer: No, that clears it up. Thank you.
Agent: You''re welcome! Have a wonderful day.'
            END,
            CASE WHEN v_i <= 3 THEN '+1555' || LPAD((1000000 + v_i * 12345)::TEXT, 7, '0') ELSE NULL END,
            CASE WHEN v_i <= 3 THEN 'Customer ' || v_i ELSE NULL END,
            CASE (v_i % 6)
                WHEN 0 THEN 'Payment Collected'
                WHEN 1 THEN 'Payment Arrangement'
                WHEN 2 THEN 'Callback Scheduled'
                WHEN 3 THEN 'Voicemail'
                WHEN 4 THEN 'Wrong Number'
                ELSE 'Follow-up Required'
            END,
            'audited',
            v_i IN (1, 5, 12, 18), -- Bookmark some calls
            CASE WHEN v_i = 1 THEN 'Excellent objection handling - use for training' ELSE NULL END
        )
        RETURNING id INTO v_call_id;

        v_call_ids := array_append(v_call_ids, v_call_id);
    END LOOP;

    -- ============================================
    -- Create Report Cards for Each Call
    -- ============================================
    FOR v_i IN 1..30 LOOP
        v_call_id := v_call_ids[v_i];

        INSERT INTO report_cards (
            id,
            user_id,
            call_id,
            source_file,
            source_type,
            overall_score,
            communication_score,
            compliance_score,
            accuracy_score,
            tone_score,
            empathy_score,
            resolution_score,
            feedback,
            strengths,
            areas_for_improvement,
            recommendations,
            criteria_results,
            ai_model,
            ai_provider,
            processing_time_ms,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_jake_id,
            v_call_id,
            'FIVE9-' || TO_CHAR(NOW() - (v_i || ' days')::INTERVAL, 'YYYYMMDD') || '.mp3',
            'call',
            CASE
                WHEN v_i <= 5 THEN 88 + (RANDOM() * 10)::INTEGER
                WHEN v_i <= 15 THEN 82 + (RANDOM() * 12)::INTEGER
                ELSE 75 + (RANDOM() * 15)::INTEGER
            END,
            80 + (RANDOM() * 18)::INTEGER,
            85 + (RANDOM() * 15)::INTEGER,
            78 + (RANDOM() * 20)::INTEGER,
            82 + (RANDOM() * 16)::INTEGER,
            80 + (RANDOM() * 18)::INTEGER,
            75 + (RANDOM() * 22)::INTEGER,
            CASE (v_i % 4)
                WHEN 0 THEN 'Jake demonstrated excellent communication skills throughout this call. The opening was professional and compliant with all required disclosures. Customer rapport was established quickly, and empathy was shown when the customer shared their situation. The resolution was satisfactory, resulting in a successful payment arrangement.'
                WHEN 1 THEN 'Good overall performance on this call. Jake followed the required script elements and maintained a professional tone. Some areas for improvement include taking more time to explore the customer''s full financial situation before proposing solutions. The call closure was effective.'
                WHEN 2 THEN 'This call showed strong compliance adherence and professional demeanor. Jake successfully navigated a challenging customer interaction with patience. The verification process was thorough. Consider adding more empathy statements during difficult conversations.'
                ELSE 'Solid performance with room for improvement. The call opening met all compliance requirements. Jake could improve by using more active listening techniques and summarizing the customer''s concerns before offering solutions.'
            END,
            ARRAY[
                'Professional opening and proper compliance disclosures',
                'Good active listening skills demonstrated',
                'Effective use of empathy statements',
                'Successful resolution achieved'
            ],
            ARRAY[
                'Could provide more detailed payment breakdowns',
                'Consider pausing more to let customer speak',
                'Explore alternative solutions before settling on first option'
            ],
            ARRAY[
                'Practice the payment calculator to provide faster quotes',
                'Review empathy statement guide for additional phrases',
                'Consider asking "Is there anything else concerning you about this?" before closing'
            ],
            jsonb_build_object(
                'QQ', jsonb_build_object('result', CASE WHEN RANDOM() > 0.2 THEN 'PASS' ELSE 'PARTIAL' END, 'explanation', 'Qualifying questions were addressed'),
                'VCI', jsonb_build_object('result', 'PASS', 'explanation', 'Customer identity properly verified'),
                'PERMISSION', jsonb_build_object('result', 'PASS', 'explanation', 'Marketing permissions reviewed'),
                'WHY_SMILE', jsonb_build_object('result', CASE WHEN RANDOM() > 0.3 THEN 'PASS' ELSE 'PARTIAL' END, 'explanation', 'Friendly tone maintained'),
                'WHAT_EMPATHY', jsonb_build_object('result', CASE WHEN RANDOM() > 0.25 THEN 'PASS' ELSE 'PARTIAL' END, 'explanation', 'Empathy demonstrated'),
                'WHERE_RESOLUTION', jsonb_build_object('result', CASE WHEN v_i % 3 = 0 THEN 'PASS' WHEN v_i % 3 = 1 THEN 'PARTIAL' ELSE 'FAIL' END, 'explanation', 'Resolution progress made')
            ),
            CASE WHEN RANDOM() > 0.5 THEN 'gpt-4o-mini' ELSE 'llama3' END,
            CASE WHEN RANDOM() > 0.5 THEN 'openai' ELSE 'lmstudio' END,
            (1500 + RANDOM() * 3000)::INTEGER,
            NOW() - (v_i || ' days')::INTERVAL
        )
        RETURNING id INTO v_report_id;

        -- ============================================
        -- Create Call Analytics for Each Call
        -- ============================================
        INSERT INTO call_analytics (
            call_id,
            user_id,
            call_duration_seconds,
            agent_talk_time_seconds,
            customer_talk_time_seconds,
            silence_time_seconds,
            talk_to_listen_ratio,
            overall_sentiment,
            sentiment_score,
            sentiment_timeline,
            keywords_found,
            compliance_keywords_found,
            prohibited_keywords_found,
            empathy_keywords_found,
            escalation_triggers_found,
            script_adherence_score,
            call_outcome,
            dead_air_count,
            interruption_count,
            hold_time_seconds,
            ai_summary,
            ai_model,
            processing_time_ms,
            created_at
        ) VALUES (
            v_call_id,
            v_jake_id,
            180 + (RANDOM() * 420)::INTEGER,
            (90 + RANDOM() * 180)::INTEGER,
            (60 + RANDOM() * 150)::INTEGER,
            (10 + RANDOM() * 30)::INTEGER,
            1.2 + (RANDOM() * 0.6)::NUMERIC(3,2),
            CASE
                WHEN v_i <= 10 THEN 'positive'
                WHEN v_i <= 20 THEN CASE WHEN RANDOM() > 0.3 THEN 'positive' ELSE 'neutral' END
                ELSE CASE WHEN RANDOM() > 0.5 THEN 'neutral' WHEN RANDOM() > 0.2 THEN 'positive' ELSE 'negative' END
            END,
            CASE WHEN v_i <= 10 THEN 0.4 + (RANDOM() * 0.5) ELSE -0.2 + (RANDOM() * 0.8) END,
            jsonb_build_array(
                jsonb_build_object('timestamp', 0, 'sentiment', 'neutral', 'score', 0),
                jsonb_build_object('timestamp', 60, 'sentiment', 'positive', 'score', 0.3),
                jsonb_build_object('timestamp', 120, 'sentiment', 'positive', 'score', 0.5)
            ),
            jsonb_build_array(
                jsonb_build_object('phrase', 'this call may be recorded', 'category', 'compliance', 'count', 1, 'weight', 10),
                jsonb_build_object('phrase', 'I understand', 'category', 'empathy', 'count', 2 + (RANDOM() * 3)::INTEGER, 'weight', 3),
                jsonb_build_object('phrase', 'thank you', 'category', 'empathy', 'count', 3 + (RANDOM() * 4)::INTEGER, 'weight', 2)
            ),
            3 + (RANDOM() * 3)::INTEGER,
            CASE WHEN v_i = 15 THEN 1 ELSE 0 END,
            4 + (RANDOM() * 5)::INTEGER,
            CASE WHEN v_i IN (8, 22) THEN 1 ELSE 0 END,
            75 + (RANDOM() * 23)::INTEGER,
            CASE (v_i % 6)
                WHEN 0 THEN 'payment_collected'
                WHEN 1 THEN 'payment_arrangement'
                WHEN 2 THEN 'callback_scheduled'
                WHEN 3 THEN 'voicemail'
                WHEN 4 THEN 'wrong_party'
                ELSE 'other'
            END,
            (RANDOM() * 3)::INTEGER,
            (RANDOM() * 2)::INTEGER,
            (RANDOM() * 30)::INTEGER,
            'Agent Jake handled this call professionally, maintaining compliance throughout. Customer concern was addressed effectively.',
            'gpt-4o-mini',
            (800 + RANDOM() * 1500)::INTEGER,
            NOW() - (v_i || ' days')::INTERVAL
        );
    END LOOP;

    -- ============================================
    -- Create Sample Disputes (2 for demo)
    -- ============================================
    SELECT id INTO v_report_id
    FROM report_cards
    WHERE user_id = v_jake_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_report_id IS NOT NULL THEN
        INSERT INTO score_disputes (
            report_card_id,
            user_id,
            dispute_reason,
            criteria_disputed,
            supporting_evidence,
            status,
            priority,
            created_at
        ) VALUES (
            v_report_id,
            v_jake_id,
            'I believe the Resolution score should be higher. At timestamp 3:45, I successfully obtained a payment arrangement from the customer which isn''t reflected in the scoring.',
            jsonb_build_array(
                jsonb_build_object(
                    'criterion_id', 'WHERE_RESOLUTION',
                    'original_result', 'PARTIAL',
                    'agent_claim', 'Customer agreed to payment plan at 3:45 - this should be PASS'
                )
            ),
            'Timestamp 3:45 - Customer says "Yes, I can manage that" in response to payment arrangement offer. Transaction was processed successfully.',
            'pending',
            'normal',
            NOW() - INTERVAL '2 days'
        );

        SELECT id INTO v_report_id
        FROM report_cards
        WHERE user_id = v_jake_id
        ORDER BY created_at DESC
        OFFSET 10
        LIMIT 1;

        IF v_report_id IS NOT NULL THEN
            INSERT INTO score_disputes (
                report_card_id,
                user_id,
                dispute_reason,
                criteria_disputed,
                supporting_evidence,
                status,
                priority,
                reviewed_by,
                reviewed_at,
                resolution_notes,
                adjusted_scores,
                created_at
            ) VALUES (
                v_report_id,
                v_jake_id,
                'The empathy score doesn''t reflect the customer feedback. Customer specifically thanked me for being understanding.',
                jsonb_build_array(
                    jsonb_build_object(
                        'criterion_id', 'WHAT_EMPATHY',
                        'original_result', 'PARTIAL',
                        'agent_claim', 'Customer feedback: "Thank you for being so understanding"'
                    )
                ),
                'At call end (timestamp 6:20), customer states: "Thank you for being so understanding about my situation."',
                'approved',
                'normal',
                v_manager_id,
                NOW() - INTERVAL '5 days',
                'After reviewing the call recording, the customer did express gratitude for empathy shown. Score adjusted from 78 to 85.',
                jsonb_build_object(
                    'empathy_score', 85,
                    'overall_score', 84
                ),
                NOW() - INTERVAL '8 days'
            );
        END IF;
    END IF;

    -- ============================================
    -- Create Coaching Sessions
    -- ============================================
    INSERT INTO coaching_sessions (
        agent_id,
        coach_id,
        session_type,
        title,
        description,
        scheduled_at,
        duration_minutes,
        status,
        notes,
        action_items,
        created_at
    ) VALUES
    (
        v_jake_id,
        v_manager_id,
        'one_on_one',
        'Weekly Performance Review',
        'Regular check-in to review call quality metrics and discuss improvement opportunities.',
        NOW() + INTERVAL '3 days',
        30,
        'scheduled',
        NULL,
        jsonb_build_array(),
        NOW()
    ),
    (
        v_jake_id,
        v_manager_id,
        'call_review',
        'Empathy Training Follow-up',
        'Review of recent calls to reinforce empathy techniques discussed in last session.',
        NOW() - INTERVAL '7 days',
        45,
        'completed',
        'Jake showed significant improvement in empathy statements. Discussed using more open-ended questions to understand customer situations better.',
        jsonb_build_array(
            jsonb_build_object('item', 'Practice 3 empathy phrases daily', 'completed', true),
            jsonb_build_object('item', 'Review empathy training module', 'completed', true),
            jsonb_build_object('item', 'Shadow top performer Maria on 2 calls', 'completed', false)
        ),
        NOW() - INTERVAL '14 days'
    ),
    (
        v_jake_id,
        v_manager_id,
        'performance_improvement',
        'Script Adherence Coaching',
        'Address lower script adherence scores from last week.',
        NOW() - INTERVAL '21 days',
        60,
        'completed',
        'Reviewed script requirements. Jake was skipping some compliance language on shorter calls. Created a checklist for him to use.',
        jsonb_build_array(
            jsonb_build_object('item', 'Use compliance checklist on all calls', 'completed', true),
            jsonb_build_object('item', 'Self-audit 5 calls per day', 'completed', true)
        ),
        NOW() - INTERVAL '21 days'
    );

    -- ============================================
    -- Add bookmarked calls to a collection
    -- ============================================
    INSERT INTO call_collections (name, description, is_public, created_by)
    VALUES (
        'Jake''s Best Calls',
        'Collection of exemplary calls from Jake Hart for training purposes',
        true,
        v_manager_id
    );

    RAISE NOTICE 'Demo mock data created successfully for Jake Hart (ID: %)', v_jake_id;
END $$;
