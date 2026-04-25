CREATE TABLE   IF NOT EXISTS  public.users (
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
    url_source TEXT,
    initial_time timestamp DEFAULT CURRENT_TIMESTAMP,
    final_date timestamp);
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS url_source TEXT;
CREATE TABLE IF NOT EXISTS conversation_lines (
    id text ,
    conversation_id text REFERENCES conversation(id) ON DELETE CASCADE,
    type TEXT,
    msg TEXT,
    time_msg timestamp DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE conversation_lines DROP CONSTRAINT IF EXISTS conversation_lines_conversation_id_fkey;
ALTER TABLE conversation_lines ADD CONSTRAINT conversation_lines_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversation(id) ON DELETE CASCADE;
 

CREATE TABLE IF NOT EXISTS conversation_notes (
    conversation_id TEXT PRIMARY KEY REFERENCES conversation(id) ON DELETE CASCADE,
    notes TEXT,
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Per-word review tracking. Newer columns are added with IF NOT EXISTS so existing
-- deployments pick them up on the next restart without dropping data.
ALTER TABLE dictionary_words ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP NULL;
ALTER TABLE dictionary_words ADD COLUMN IF NOT EXISTS last_review_correct BOOLEAN NULL;

INSERT INTO users ( user_id,name,password,language,voice,role,max_length_answer) VALUES ('default','Guest','secret','b','bm_fable','admin',150);
INSERT INTO context ( user_id,label,context, remember)  VALUES ('default','default','You are my friend Robotito','')
