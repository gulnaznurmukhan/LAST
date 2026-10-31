#!/bin/sh
# Start script for the Vercel container. It makes the app start with whatever environment
# variables the Vercel project already has, so nothing has to be re-entered in the dashboard.
#  - accepts the database URL in any common form (jdbc:..., postgresql://user:pass@host/db, ...)
#  - takes DB_URL / DATABASE_URL / POSTGRES_URL_NON_POOLING / POSTGRES_URL, whichever exists
#  - takes the user and password from the URL if DB_USERNAME / DB_PASSWORD are not set
#  - fills in defaults for the optional settings
# Secrets are never printed.

trim() {
  printf '%s' "$1" | tr -d '\r\n' | sed -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//"
}

urldecode() {
  # %XX -> character (only for valid hex pairs); plain awk, works in Alpine's busybox too
  printf '%s' "$1" | awk '{
    s = $0; out = ""; hex = "0123456789abcdef"
    while (length(s) > 0) {
      c = substr(s, 1, 1)
      if (c == "%" && substr(s, 2, 2) ~ /^[0-9A-Fa-f][0-9A-Fa-f]$/) {
        h = tolower(substr(s, 2, 2))
        out = out sprintf("%c", (index(hex, substr(h, 1, 1)) - 1) * 16 + index(hex, substr(h, 2, 1)) - 1)
        s = substr(s, 4)
      } else { out = out c; s = substr(s, 2) }
    }
    printf "%s", out
  }'
}

raw="${DB_URL:-${DATABASE_URL:-${POSTGRES_URL_NON_POOLING:-${POSTGRES_URL:-}}}}"
raw="$(trim "$raw")"

url_user=""
url_pass=""

if [ -n "$raw" ]; then
  rest="${raw#jdbc:}"
  rest="${rest#postgresql://}"
  rest="${rest#postgres://}"

  authority="${rest%%/*}"
  if [ "$authority" = "$rest" ]; then path=""; else path="/${rest#*/}"; fi

  case "$authority" in
    *@*)
      userinfo="${authority%@*}"
      hostport="${authority##*@}"
      url_user="${userinfo%%:*}"
      case "$userinfo" in *:*) url_pass="${userinfo#*:}" ;; esac
      url_user="$(urldecode "$url_user")"
      url_pass="$(urldecode "$url_pass")"
      ;;
    *) hostport="$authority" ;;
  esac

  case "$hostport" in *:*) ;; *) hostport="$hostport:5432" ;; esac

  dbname="${path%%\?*}"
  case "$path" in *\?*) query="${path#*\?}" ;; *) query="" ;; esac
  [ -z "$dbname" ] || [ "$dbname" = "/" ] && dbname="/postgres"

  # drop parameters the JDBC driver does not know (added by some Supabase/Vercel integrations)
  query="$(printf '%s' "$query" | tr '&' '\n' | grep -v '^supa=' | grep -v '^$' | paste -sd '&' -)"
  case "$query" in *sslmode=*) ;; *) query="${query:+$query&}sslmode=require" ;; esac

  export DB_URL="jdbc:postgresql://${hostport}${dbname}?${query}"
else
  echo "[entrypoint] ERROR: no database URL found (DB_URL / DATABASE_URL / POSTGRES_URL). Set DB_URL in the Vercel project." >&2
fi

[ -n "${DB_USERNAME:-}" ] || DB_USERNAME="${url_user:-${POSTGRES_USER:-}}"
[ -n "${DB_PASSWORD:-}" ] || DB_PASSWORD="${url_pass:-${POSTGRES_PASSWORD:-}}"
[ -n "$DB_USERNAME" ] && export DB_USERNAME
[ -n "$DB_PASSWORD" ] && export DB_PASSWORD

# Defaults for optional settings (a value set in Vercel always wins)
: "${PORT:=80}";                               export PORT
: "${SPRING_PROFILES_ACTIVE:=prod}";           export SPRING_PROFILES_ACTIVE
: "${DB_POOL_SIZE:=3}";                        export DB_POOL_SIZE
[ -n "${APP_PUBLIC_URL:-}" ] || echo "[entrypoint] WARNING: APP_PUBLIC_URL is not set: links in emails will be wrong. Set it to the frontend URL (https://<frontend>.vercel.app)." >&2
: "${SMTP_HOST:=smtp-relay.brevo.com}";        export SMTP_HOST
: "${SMTP_PORT:=587}";                         export SMTP_PORT
: "${SMTP_AUTH:=true}";                        export SMTP_AUTH
: "${SMTP_STARTTLS:=true}";                    export SMTP_STARTTLS
: "${JAVA_OPTS:=-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -XX:TieredStopAtLevel=1 -XX:+UseSerialGC}"

# Non-secret summary for the runtime logs
db_host="${DB_URL#jdbc:postgresql://}"; db_host="${db_host%%/*}"
echo "[entrypoint] port=$PORT profile=$SPRING_PROFILES_ACTIVE db_host=${db_host:-MISSING} db_user=$([ -n "$DB_USERNAME" ] && echo set || echo MISSING) db_password=$([ -n "$DB_PASSWORD" ] && echo set || echo MISSING) smtp_user=$([ -n "${SMTP_USERNAME:-}" ] && echo set || echo MISSING) public_url=${APP_PUBLIC_URL:-MISSING} gemini=$([ -n "${GEMINI_API_KEY:-}" ] && echo set || echo MISSING)"

if [ "$#" -gt 0 ]; then exec "$@"; fi
exec java $JAVA_OPTS -jar /app/app.jar
