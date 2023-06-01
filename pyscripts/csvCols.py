import sys
import os
import pandas as pd

if len(sys.argv) != 2:
    print("Usage: python script.py <filename>")
    sys.exit()

filename = sys.argv[1]

# TODO: Potential optimization here. Can just scan first few lines of csv instead of loading entire doc.
df = pd.read_csv(filename)

# clean column names
# df.columns = df.columns.str.replace(' ', '')


# save "example.txt" file
examples = """Show me all data.
=====
```
import pandas as pd

data = pd.read_csv('{{{FILENAME}}}')
print(data.to_csv(index=False))
```
I printed all the data in the datasetCSV."""

cols = "<class 'pandas.core.frame.DataFrame'>\nColumn: Dtype: Examples\n"
for col in df.columns:
    unique_values = df[col].unique()[:3]  # get the first 3 unique values
    cols += f"{col}: {df[col].dtype}: {list(unique_values)}\n"

print("=====PYSCRIPT_OUTPUT=====")
print(cols)
print("=====PYSCRIPT_OUTPUT=====")
