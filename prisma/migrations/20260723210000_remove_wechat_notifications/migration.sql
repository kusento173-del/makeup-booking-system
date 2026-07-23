DROP TABLE "notification_delivery_attempts";
DROP TABLE "notification_subscription_decisions";
DROP TABLE "notification_tasks";
DROP TABLE "notification_template_versions";

DROP FUNCTION IF EXISTS "protect_notification_delivery_attempt_history"();
DROP FUNCTION IF EXISTS "protect_notification_subscription_decision_history"();
DROP FUNCTION IF EXISTS "protect_notification_task_history"();
DROP FUNCTION IF EXISTS "protect_notification_template_history"();
DROP FUNCTION IF EXISTS "notification_mini_program_mappings_valid"(VARCHAR[]);
