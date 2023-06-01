def print_table(df, columns):
    df = df.iloc[:100]
    print("=====")
    print("TABLE")
    print(df[columns].to_csv(index=False))
    print("=====")


def print_bar(df, xcol, ycol):
    df = df.iloc[:100]
    print("=====")
    print(f"BAR-----{xcol}-----{ycol}")
    print(df[xcol, ycol].to_csv(index=False))
    print("=====")


def print_line(df, xcol, ycol):
    df = df.iloc[:100]
    print("=====")
    print(f"LINE-----{xcol}-----{ycol}")
    print(df[xcol, ycol].to_csv(index=False))
    print("=====")


def print_pie(df, xcol, ycol):
    df = df.iloc[:100]
    print("=====")
    print(f"PIE-----{xcol}-----{ycol}")
    print(df[xcol, ycol].to_csv(index=False))
    print("=====")
