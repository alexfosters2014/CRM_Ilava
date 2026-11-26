-- IF NOT EXISTS: hace idempotente la primera migración. El volumen legacy
-- (creado por el antiguo init.sql) ya tiene esta tabla pero sin journal de
-- Drizzle; sin esta cláusula, `CREATE TABLE` fallaría con "already exists" y el
-- hook `init` impediría el arranque. En BD fresca se comporta igual que antes.
CREATE TABLE IF NOT EXISTS "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"email" varchar(160) NOT NULL,
	"telefono" varchar(30),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_email_unique" UNIQUE("email")
);
