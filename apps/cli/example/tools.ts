export async function listHackernewsFrontPage(): Promise<
    { id: number; title: string; url: string; score: number; by: string }[]
> {
    const ids: number[] = await fetch(
        "https://hacker-news.firebaseio.com/v0/topstories.json",
    ).then((r) => r.json());

    const top = ids.slice(0, 30);
    const items = await Promise.all(
        top.map((id) =>
            fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(
                (r) => r.json(),
            ),
        ),
    );

    return items.map((item: Record<string, unknown>) => ({
        id: item.id as number,
        title: item.title as string,
        url: (item.url as string) ?? "",
        score: item.score as number,
        by: item.by as string,
    }));
}

export async function getHackernewsPost(id: number): Promise<{
    id: number;
    title: string;
    url: string;
    text: string;
    score: number;
    by: string;
    descendants: number;
}> {
    const item: Record<string, unknown> = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
    ).then((r) => r.json());

    return {
        id: item.id as number,
        title: item.title as string,
        url: (item.url as string) ?? "",
        text: (item.text as string) ?? "",
        score: item.score as number,
        by: item.by as string,
        descendants: (item.descendants as number) ?? 0,
    };
}

export async function getHackernewsComments(
    postId: number,
    limit: number,
): Promise<{ by: string; text: string }[]> {
    const post: Record<string, unknown> = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${postId}.json`,
    ).then((r) => r.json());

    const kids = ((post.kids as number[]) ?? []).slice(0, limit);
    const comments = await Promise.all(
        kids.map((id) =>
            fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(
                (r) => r.json(),
            ),
        ),
    );

    return comments
        .filter(
            (c: Record<string, unknown>) =>
                c && c.type === "comment" && !c.deleted,
        )
        .map((c: Record<string, unknown>) => ({
            by: (c.by as string) ?? "unknown",
            text: (c.text as string) ?? "",
        }));
}
