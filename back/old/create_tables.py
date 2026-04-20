#!/usr/bin/env python3
import os
import sys
sys.path.append('/home/chuchip/robotito/back/src')

# Set up environment
os.environ["GRPC_VERBOSITY"] = "ERROR"
os.environ["GLOG_minloglevel"] = "2"

from sqlalchemy import create_engine
from dbtables import Base

# Database connection
db_host = os.getenv("DB_HOST", "localhost")
db_user = os.getenv("DB_USER", "robotito")
db_password = os.getenv("DB_PASSWORD", "robotito")
db_name = os.getenv("DB_NAME", "robotito")

engine = create_engine(f"postgresql://{db_user}:{db_password}@{db_host}/{db_name}")

print("Creating database tables...")
Base.metadata.create_all(engine)
print("Tables created successfully!")