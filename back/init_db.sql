CREATE TABLE public.users (
	user_id text NOT NULL PRIMARY KEY,
	"name" text NULL,
	email text NULL,
	"password" text NULL,
	"language" text NULL,
	voice text NULL,
	"role" text NULL,
	max_length_answer int4 NULL,
	last_date timestamp DEFAULT CURRENT_TIMESTAMP NULL	
);
CREATE TABLE IF NOT EXISTS user_session (
    uuid TEXT PRIMARY KEY,
    user_id TEXT,
    last_date timestamp  DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS context ( 
    id SERIAL PRIMARY KEY ,
    user_id TEXT, 
    label TEXT,
    context TEXT,
    remember TEXT,
    last_time timestamp DEFAULT CURRENT_TIMESTAMP  );

 CREATE TABLE IF NOT EXISTS conversation (
    id text primary key,
    user_id TEXT,
    context_id TEXT,
    name text,
    initial_time timestamp DEFAULT CURRENT_TIMESTAMP,
    final_date timestamp);
CREATE TABLE IF NOT EXISTS conversation_lines (
    id text primary key,
    conversation_id text,
    type TEXT,
    msg TEXT,
    time_msg timestamp DEFAULT CURRENT_TIMESTAMP);
 
 CREATE TABLE public.users (
	user_id text NOT NULL PRIMARY KEY,
	"name" text NULL,
	email text NULL,
	"password" text NULL,
	"language" text NULL,
	voice text NULL,
	"role" text NULL,
	max_length_answer int4 NULL,
	last_date timestamp DEFAULT CURRENT_TIMESTAMP NULL	
);
CREATE TABLE IF NOT EXISTS user_session (
    uuid TEXT PRIMARY KEY,
    user_id TEXT,
    last_date timestamp  DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS context ( 
    id SERIAL PRIMARY KEY ,
    user_id TEXT, 
    label TEXT,
    context TEXT,
    remember TEXT,
    last_time timestamp DEFAULT CURRENT_TIMESTAMP  );

 CREATE TABLE IF NOT EXISTS conversation (
    id text primary key,
    user_id TEXT,
    context_id TEXT,
    name text,
    initial_time timestamp DEFAULT CURRENT_TIMESTAMP,
    final_date timestamp);
CREATE TABLE IF NOT EXISTS conversation_lines (
    id text primary key,
    conversation_id text,
    type TEXT,
    msg TEXT,
    time_msg timestamp DEFAULT CURRENT_TIMESTAMP);
INSERT INTO users ( user_id,name,password,language,voice,role,max_length_answer) VALUES ('default','Guest','secret','b','bm_fable','admin',150);
INSERT INTO context ( user_id,label,context, remember)  VALUES ('default','default','You are my friend Robotito','')
