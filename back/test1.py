from langchain.output_parsers import PydanticOutputParser
from langchain.prompts import ChatPromptTemplate,PromptTemplate
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from typing import List

def configGeminiAI(temperature=0.6): 
  model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-preview-04-17",
    temperature=temperature,
    streaming=True,
    timeout=None,
    max_retries=2
  )
  return model
class AnalizePhrase(BaseModel):
  """Information about each analized setence"""
  sentence:str = Field(description="Original sentencer to analize")
  rating:str=Field(description="Set the rating for the original sentence. Set the value 'Good' only the analized sentence doesn't have any grammatical error")
  explication:str=Field(description="Explication of why you give the previous status")
  correction:str=Field(description="Give an description about what was wrong on the sentence")
class AnalizePhrases(BaseModel):
  """Container to keep a list of elemnts of type AnalizePhrase """
  result :List[AnalizePhrase] = Field(description="An array containing elements of type  'AnalizePhrase'")


prompt_detail_str = """
In the following sentences, analyze each one and determine if it's understandable and free of grammatical errors. Ignore punctuation, missing spaces, and potential clarity improvements. The target audience is B2 level.
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Sentences  to analyze:
{sentence_input}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""

parser_detail = PydanticOutputParser(pydantic_object=AnalizePhrases)
format_instructions = parser_detail.get_format_instructions()
prompt_detail = PromptTemplate(
    template=prompt_detail_str,
    input_variables=["sentence_input"],
    partial_variables={"format_instructions": format_instructions}
)
llm_text=configGeminiAI(0.0)
chain_detail = prompt_detail | llm_text | parser_detail
chat_history=[
   "I want giver you and pepino",
   "Yeah, but why sometimes it rains a lot and sometimes it rains only a few droplets.",
   "Ok, And what does it produce more rain in the same time?",
   "But, there is a big difference between the rain that is falling one time and another. how can it b? Sometimes fall two droplets and sometimes fall liters and liters of water."
]
i=0
msg=""
for line in chat_history:    
       msg += f"Sentence number {i}: {line}\n"
       i+=1
msg="""
- Sentence number 1: "I want to talk about clouds and rain. I want to know how they are formed and because the rain fall down"
- Sentence number 2: "Yeah, but why sometimes it rains a lot and sometimes it rains only a few droplets. Sentence number 3: Ok,   And what does it produce more rain in the same time? "
- Sentence number 3: "But, there is a big difference between the rain that is falling one time and another.   how can it b? Sometimes fall  two droplets and sometimes fall liters and liters of water. "
- Sentence number 4: "So, this is a complicated thing, right? "
- Sentence number 5: "And then how does the scientists making a forecast? "
- Sentence number 6: "but they fail in predictions a lot of times. is that because the weather is changing?.    I mean, because the climate changed "
- Sentence number 8: "Do you know when has it rained more in the history? "
- Sentence number 9: "What is an mm measure? "
- Sentence number 10: "no, I mean, in the context of raining "
- Sentence number 11: "So for example 10 millimeters, how many liters of water could be? "
- Sentence number 12: "I want to say: 10 mm, how many liters of water would be?" 
- Sentence number 13: "I mean: 10 mm, how many liters of water would that be? "
- Sentence number 14: "when  scientists make a forecast, they talk about mm. So, How can I interpret that? "
- Sentence number 15: "so, 20mm in one meter, how many liters is it? "
- Sentence number 16: "so, does the water that fell in Mawsynram (26,461 mm)  was more than 50000 liters in a meter square ? "
"""
msg1="""
- Sentence number 1: "I want to talk about clouds and rain. I want to know how they are formed and because the rain fall down" \n- Sentence number 2: "Yeah, but why sometimes it rains a lot and sometimes it rains only a few droplets." \n- Sentence number 3: "Ok,   And what does it produce more rain in the same time?" \n- Sentence number 4: "But, there is a big difference between the rain that is falling one time and another.   how can it b? Sometimes fall  two droplets and sometimes fall liters and liters of water." \n- Sentence number 5: "So, this is a complicated thing, right?" \n- Sentence number 6: "And then how does the scientists making a forecast?" \n- Sentence number 7: "but they fail in predictions a lot of times. is that because the weather is changing?.    I mean, because the climate changed" \n- Sentence number 8: "Do you know when has it rained more in the history?" \n- Sentence number 9: "What is an mm measure?" \n- Sentence number 10: "no, I mean, in the context of raining" \n- Sentence number 11: "So for example 10 millimeters, how many liters of water could be?" \n- Sentence number 12: "I want to say: 10 mm, how many liters of water would be?" \n- Sentence number 13: "I mean: 10 mm, how many liters of water would that be?" \n- Sentence number 14: "when  scientists make a forecast, they talk about mm. So, How can I interpret that?" \n- Sentence number 15: "so, 20mm in one meter, how many liters is it?" \n- Sentence number 16: "so, does the water that fell in Mawsynram (26,461 mm)  was more than 50000 liters in a meter square ?" \n- Sentence number 17: "Why don\'t they talk in liters ?   That would be easier" \n- Sentence number 18: "Yes, but I don\'t understand.  They, for example, say tomorrow is going to rain 20 millimeters in one city but  I don\'t know what is the size of the city so, how can I know the intensity of the rain?" \n- Sentence number 19: "yes I understand that but I continue thinking that it would be easier to say: it would be rain 20 liters square meter" \n- Sentence number 20: "I think that you\'re wrong I think that when they say 20 millimeters they are saying that it would be rain 20 millimeters per square meter" \n- Sentence number 21: "I think that you\'re wrong. I believe that when they say 20 millimeters they are saying that it would be rain 20 millimeters per square meter" \n- Sentence number 22: "Changing the subject. ¿ Is this sentence wrong?\n"I think that you\'re wrong. I believe that when they say 20 millimeters they are saying that it would be rain 20 millimeters per square meter"" \n- Sentence number 23: "I think you\'re wrong. I believe that when they say 20 millimeters, they are saying that it will rain 20 millimeters per square meter" 
"""
result=  chain_detail.invoke({"sentence_input": msg1})

print(result.result[0].rating)
print(result.result[1].rating)
print(result.result[3].rating)