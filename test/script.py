import sys
from nltk import tokenize
import chromadb
import time
import openai
import os
from dotenv import load_dotenv

load_dotenv()

openai.api_key = os.getenv("OPENAI_API_KEY")

# Function to print the runtime in milliseconds
def print_runtime(start_time, end_time, msg=""):
    runtime_ms = (end_time - start_time) * 1000
    print(msg)
    print("Runtime:", runtime_ms, "milliseconds")
    print()
start_time = time.time()

if len(sys.argv) != 4:
    print("Usage: python script.py <textfile> <questionfile> <k>")
    sys.exit()

def break_string_into_chunks(string, max_length, chunk_size):
    if len(string) <= max_length:
        return [string]  # Return the whole string as a single chunk

    chunks = []
    current_chunk = ""
    for char in string:
        if len(current_chunk) == chunk_size:
            chunks.append(current_chunk)
            current_chunk = ""
        current_chunk += char

    # Append the last chunk
    if current_chunk:
        chunks.append(current_chunk)

    return chunks


textfile = sys.argv[1]
questionfile = sys.argv[2]
k = int(sys.argv[3])

text = open(textfile, 'r').read()
question = open(questionfile, 'r').read()
print_runtime(start_time, time.time(), "read text:")

start_time = time.time()
long_sentences = tokenize.sent_tokenize(text)
print_runtime(start_time, time.time(), "tokenized text:")

sentences = []
for sentence in long_sentences:
    sentences += break_string_into_chunks(sentence, 1000, 1000)

sentences = list(filter(lambda x: len(x) > 20, sentences))

chroma_client = chromadb.Client()

def embedder(list_of_sentences):
    raw = openai.Embedding.create(
        model="text-embedding-ada-002",
        input=list_of_sentences
    )
    return list(map(lambda x: x.embedding, raw.data))

start_time = time.time()
current_sentences = []
vectors = []
# Split into chunks of 500
for i in sentences:
    current_sentences.append(i)
    if len(current_sentences) >= 500 or i == sentences[-1]:
        new_vectors = embedder(current_sentences)
        vectors += new_vectors
        current_sentences = []
print_runtime(start_time, time.time(), "embedded text:")

collection = chroma_client.create_collection(
    name="my_collection", embedding_function=None)

start_time = time.time()
collection.add(
    embeddings=vectors,
    documents=sentences,
    ids=list(map(lambda x: str(x), range(len(sentences)))),
)
print_runtime(start_time, time.time(), "added to collection")

results = collection.query(
    query_embeddings=embedder(question),
    n_results=k
)

documents = results['documents'][0]

# Convert distances to strings
distances = list(map(lambda x: str(x), results['distances'][0]))
