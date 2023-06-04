import sys
from nltk import tokenize
import chromadb
import time

# Function to print the runtime in milliseconds
def print_runtime(start_time, end_time):
    runtime_ms = (end_time - start_time) * 1000
    print("Runtime:", runtime_ms, "milliseconds")
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

long_sentences = tokenize.sent_tokenize(text)
print("tokenized text")
print_runtime(start_time, time.time())

sentences = []
for sentence in long_sentences:
    sentences += break_string_into_chunks(sentence, 1000, 1000)

sentences = list(filter(lambda x: len(x) > 20, sentences))

chroma_client = chromadb.Client()

# import openai
# openai.api_key = "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"
# def embedder(list_of_sentences):
#     raw = openai.Embedding.create(
#         model="text-embedding-ada-002",
#         input=list_of_sentences
#     )
#     return list(map(lambda x: x.embedding, raw.data))


from sentence_transformers import SentenceTransformer
model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
embedder = lambda x: model.encode(x).tolist()


collection = chroma_client.create_collection(
    name="my_collection", embedding_function=embedder)

collection.add(
    documents=sentences,
    ids=list(map(lambda x: str(x), range(len(sentences))))
)

print("added to collection")
print_runtime(start_time, time.time())

results = collection.query(
    query_texts=[question],
    n_results=k
)

documents = results['documents'][0]

# Convert distances to strings
distances = list(map(lambda x: str(x), results['distances'][0]))

print("=====PYSCRIPT_OUTPUT=====")
print("\n=====\n".join(documents + distances))
print("=====PYSCRIPT_OUTPUT=====")
