export const ACTIVE_USERS_PLACEHOLDER_PROMPT =
  "Find active users in $1 who signed up after $2 and include their order count and total spend.";

export const ACTIVE_USERS_SQL = `
SELECT
  u.id,
  u.email,
  u.full_name AS "fullName",
  u.country,
  u.signup_date AS "signupDate",
  COUNT(o.id)::int AS "orderCount",
  COALESCE(SUM(o.total_cents), 0)::int AS "totalSpendCents"
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'ACTIVE'
  AND u.country = $1
  AND u.signup_date >= $2::timestamptz
GROUP BY u.id
ORDER BY u.signup_date DESC
`;
