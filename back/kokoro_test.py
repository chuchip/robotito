from kokoro import KPipeline
import soundfile as sf

from playsound import playsound
from pydub import AudioSegment
from io import BytesIO
import numpy as np
from pydub import AudioSegment
import wave
pipeline = KPipeline(lang_code='a') # make sure lang_code matches voice

# The following text is for demonstration purposes only, unseen during training
text = '''
The sky above the port was the color of television, tuned to a dead channel.
"It's not like I'm using," Case heard someone say, as he shouldered his way through the crowd around the door of the Chat. "It's like my body's developed this massive drug deficiency."
It was a Sprawl voice and a Sprawl joke. The Chatsubo was a bar for professional expatriates; you could drink there for a week and never hear two words in Japanese.

These were to have an enormous impact, not only because they were associated with Constantine, but also because, as in so many other areas, the decisions taken by Constantine (or in his name) were to have great significance for centuries to come. One of the main issues was the shape that Christian churches were to take, since there was not, apparently, a tradition of monumental church buildings when Constantine decided to help the Christian church build a series of truly spectacular structures. The main form that these churches took was that of the basilica, a multipurpose rectangular structure, based ultimately on the earlier Greek stoa, which could be found in most of the great cities of the empire. Christianity, unlike classical polytheism, needed a large interior space for the celebration of its religious services, and the basilica aptly filled that need. We naturally do not know the degree to which the emperor was involved in the design of new churches, but it is tempting to connect this with the secular basilica that Constantine completed in the Roman forum (the so-called Basilica of Maxentius) and the one he probably built in Trier, in connection with his residence in the city at a time when he was still caesar.
'''

# 4️⃣ Generate, display, and save audio files in a loop.
generator = pipeline(
    text, voice='af_bella',
    speed=1, split_pattern=r'\n+'
)

for i, (gs, ps, audio) in enumerate(generator):
    logging.info(i)  # i => index
    logging.info(gs) # gs => graphemes/text
    logging.info(ps) # ps => phonemes 
    if (i==0):
        total = audio
    else:
        total=np.concatenate((total, audio), axis=0)
    #

sf.write(f'audio.wav', total, 24000)    

