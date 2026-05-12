import feedparser
from bs4 import BeautifulSoup
# Replace with any RSS URL
 

# Accessing metadata
def get_plain_text_feed(url):
    feed = feedparser.parse(url)
    print(f"{len(feed)} entries found")
    entry_num=1
    for entry in feed.entries:
        # 1. Get the raw HTML content (checking content list first, then summary)
        raw_html = ""
        if 'content' in entry:
            raw_html = entry.content[0].value
        elif 'summary' in entry:
            raw_html = entry.summary
            
        # 2. Use BeautifulSoup to strip ALL tags
        # 'get_text()' removes tags like <a>, <p>, <div> and returns just the strings
        soup = BeautifulSoup(raw_html, "html.parser")
        
        # Optional: Remove specific tags if get_text() isn't enough 
        # (e.g., if you wanted to remove script or style blocks specifically)
        for script_or_style in soup(["script", "style"]):
            script_or_style.decompose()

        plain_text = soup.get_text(separator=' ') # separator=' ' prevents words from sticking together
        
        # 3. Clean up whitespace
        clean_text = " ".join(plain_text.split())
        print(f"{entry_num} - Link: {entry.link}")
        print(f"TITLE: {entry.title}")
        print(f"TEXT: {clean_text}")
        print("-" * 30)
        entry_num += 1

# get_plain_text_feed("https://www.wired.com/feed/category/science/latest/rss")        
#get_plain_text_feed("https://www.nytimes.com/services/xml/rss/nyt/HomePage.xml")        
#get_plain_text_feed("https://www.cnet.com/rss/news/")

get_plain_text_feed("https://feeds.bbci.co.uk/news/technology/rss.xml")

#get_plain_text_feed("https://www.theverge.com/rss/index.xml")        

# get_plain_text_feed("https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en")