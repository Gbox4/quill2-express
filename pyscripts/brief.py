import sys
from nltk import tokenize
import chromadb

if len(sys.argv) != 4:
    print("Usage: python script.py <textfile> <questionfile> <k>")
    sys.exit()

textfile = sys.argv[1]
questionfile = sys.argv[2]
k = int(sys.argv[3])

text = open(textfile, 'r').read()
question = open(questionfile, 'r').read()

sentences = tokenize.sent_tokenize(text)

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
