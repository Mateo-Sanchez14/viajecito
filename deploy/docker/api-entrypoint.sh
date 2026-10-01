#!/bin/sh
# Production entrypoint: apply migrations, collect static files, then hand over to gunicorn.
set -eu

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec gunicorn config.wsgi:application \
  -b 0.0.0.0:8000 \
  --workers 2 --threads 4 --worker-class gthread \
  --access-logfile -
