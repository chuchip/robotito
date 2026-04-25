from sqlalchemy import create_engine,  Column, Integer, Text, DateTime, Boolean, func, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

from robotito_ai import db,app

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    user_id = Column(Text, primary_key=True)
    name = Column(Text)
    email = Column(Text)
    password = Column(Text)
    language = Column(Text)
    voice = Column(Text)
    role = Column(Text)
    max_length_answer = Column(Integer)
    last_date = Column(DateTime, default=func.now())
    sessions = relationship("UserSession", back_populates="user")
    contexts = relationship("Context", back_populates="user")
    conversations = relationship("Conversation", back_populates="user")

class UserSession(Base):
    __tablename__ = 'user_session'
    uuid = Column(Text, primary_key=True)
    user_id = Column(Text, ForeignKey('users.user_id'))
    last_date = Column(DateTime, default=func.now())
    expires_at = Column(DateTime)
    user = relationship("User", back_populates="sessions")

class Context(Base):
    __tablename__ = 'context'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Text, ForeignKey('users.user_id'))
    label = Column(Text)
    context = Column(Text)
    remember = Column(Text)
    last_time = Column(DateTime, default=func.now())
    user = relationship("User", back_populates="contexts")

class Conversation(Base):
    __tablename__ = 'conversation'
    id = Column(Text, primary_key=True)
    user_id = Column(Text, ForeignKey('users.user_id'))
    context_id = Column(Integer, ForeignKey('context.id'))
    name = Column(Text)
    url_source = Column(Text)
    initial_time = Column(DateTime, default=func.now())
    final_date = Column(DateTime)
    user = relationship("User", back_populates="conversations")
    context = relationship("Context")
    lines = relationship("ConversationLines", back_populates="conversation")
    notes = relationship("ConversationNotes")


class ConversationLines(Base):
    __tablename__ = 'conversation_lines'
    id = Column(Text, primary_key=True)
    conversation_id = Column(Text, ForeignKey('conversation.id', ondelete='CASCADE'))
    type = Column(Text)
    msg = Column(Text)
    time_msg = Column(DateTime, default=func.now())
    conversation = relationship("Conversation", back_populates="lines")

class ConversationNotes(Base):
    __tablename__ = 'conversation_notes'
    conversation_id = Column(Text, ForeignKey('conversation.id', ondelete='CASCADE'), primary_key=True)
    notes = Column(Text)
    last_update = Column(DateTime, default=func.now())
    conversation = relationship("Conversation")

class DictionaryWord(Base):
    __tablename__ = 'dictionary_words'
    id = Column(Text, primary_key=True)
    conversation_id = Column(Text, ForeignKey('conversation.id', ondelete='CASCADE'))
    user_id = Column(Text, ForeignKey('users.user_id'))
    word = Column(Text)
    translation = Column(Text)
    examples = Column(Text)
    created_date = Column(DateTime, default=func.now())
    last_update = Column(DateTime, default=func.now())
    last_reviewed_at = Column(DateTime, nullable=True)
    last_review_correct = Column(Boolean, nullable=True)
    conversation = relationship("Conversation")
    user = relationship("User")

async def create_tables():
    """
    Creates the tables in the PostgreSQL database.
    Handles the case where tables may already exist.
    """
    async with app.app_context():
        try:
            db.create_all()
            print("Tables created successfully!")
        except Exception as e:
            print(f"An error occurred: {e}")