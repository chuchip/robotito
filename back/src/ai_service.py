"""Business logic for the AI conversation features.

Depends on `init()` being called from the application entry point with the
configured LLM clients and chains before any other function is invoked.
"""
import asyncio
import logging
from langchain.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, AIMessage

import memory
from ai_models import TranslationResult, ExamplePhrase


_client_text = None
_llm_text = None
_model_api = None
_chains: dict = {}
_max_history: int = 12
_logger: logging.Logger = logging.getLogger(__name__)


def init(client_text, llm_text, model_api: str, chains: dict, max_history: int, logger: logging.Logger):
    """Wire the service with concrete LLM clients and chains."""
    global _client_text, _llm_text, _model_api, _chains, _max_history, _logger
    _client_text = client_text
    _llm_text = llm_text
    _model_api = model_api
    _chains = chains
    _max_history = max_history
    _logger = logger


async def call_llm(state):
    memoryData = memory.getMemory(state['uuid'])
    max_length_answers = memoryData.getMaxLengthAnswer()
    limit_words = f"Your answer should be less than {max_length_answers} words"
    context = memoryData.getContext()
    rememberText = ""
    if context is not None:
        rememberText = context.getRememberText()
    chat_history = memoryData.getChatHistory()
    prompt = ChatPromptTemplate.from_messages([
        ("system", "{system_msg}"),
        ("placeholder", "{msgs}"),
        ("user", "{question}"),
    ])
    question = state["message"]
    if question.strip() != "":
        swRemember = False
        if rememberText != "":
            if context.hasToRemember():
                question += f". {context.getRememberText()}"
                swRemember = True
            context.incrementRememberNumber()
        if _max_history > 0:
            msgs = chat_history[_max_history * -1:]
        else:
            msgs = chat_history
        context_text = context.getText()
        if max_length_answers != 0:
            context_text = f"{limit_words}. {context.getText()}"
            insert_pos = len(msgs) - 4
            if insert_pos > 0:
                msgs.insert(insert_pos, HumanMessage(f"Remember: {limit_words}"))
            else:
                msgs.append(HumanMessage(f"Remember: {limit_words}"))

        url_context = memoryData.getUrlContext()
        if url_context:
            url_source = memoryData.getUrlSource()
            context_text += f"\n\nUse the following web page content as reference to answer questions. Source: {url_source}\n---\n{url_context}\n---"

        chat_prompt = prompt.format_messages(
            system_msg=context_text,
            context=[],
            msgs=msgs,
            question=HumanMessage(question),
        )
        _logger.debug(f"LLM Context: {context_text}\n Question: {question}")
        if _model_api == 'ollama':
            async for chunk in _client_text.astream(chat_prompt):
                yield chunk
        else:
            try:
                async for chunk in _client_text.astream(chat_prompt):
                    yield chunk.content
            except Exception as e:
                _logger.error(f"Error in LLM call: {e}")
                yield ""
        if swRemember:
            yield "*"
    else:
        yield " "


async def call_llm_internal(chat_prompt):
    response = await asyncio.to_thread(_llm_text.invoke, chat_prompt)
    if _model_api == 'ollama':
        return response
    return response.content


async def sumary_history(uuid, type):
    chain = _chains['resume'] if type == 'resume' else _chains['detail']
    memoryData = memory.getMemory(uuid)
    chat_history = memoryData.getChatHistory()
    msg = ""
    i = 1
    for line in chat_history:
        if isinstance(line, HumanMessage):
            msg += f'- Sentence number {i}: "{line.content}" \n'
            i += 1
    return await asyncio.to_thread(chain.invoke, {"sentences_input": msg})


async def rating_phrase(phrase):
    return await asyncio.to_thread(_chains['rating'].invoke, {"sentence_input": phrase})


def save_msg(uuid, type, msg):
    chat_history = memory.getMemory(uuid).getChatHistory()
    if type == 'R':
        chat_history.append(AIMessage(content=msg))
    else:
        chat_history.append(HumanMessage(content=msg))


def restore_history(uuid, jsonHistory):
    chat_history = memory.getMemory(uuid).getChatHistory()
    chat_history.clear()
    for line in jsonHistory:
        if line['type'] == 'R':
            chat_history.append(AIMessage(content=line['msg']))
        else:
            chat_history.append(HumanMessage(content=line['msg']))


async def call_llm_translate(word: str):
    """Translate a word to Spanish with examples."""
    try:
        return await asyncio.to_thread(_chains['translation'].invoke, {"word_input": word})
    except Exception as e:
        _logger.error(f"Translation error for word '{word}': {str(e)}")
        return TranslationResult(
            translation=f"Translation for '{word}'",
            examples=[
                ExamplePhrase(
                    english_phrase="Example sentence in English",
                    spanish_phrase="Oración de ejemplo en español",
                )
            ],
        )
