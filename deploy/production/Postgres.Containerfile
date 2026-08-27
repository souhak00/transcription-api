FROM postgres:16

COPY database/*.sql /docker-entrypoint-initdb.d/
COPY deploy/production/postgres-init/*.sh /docker-entrypoint-initdb.d/

RUN chmod 0755 /docker-entrypoint-initdb.d/*.sh
