import { blogPosts } from "@/content/blog";

export const runtime = "edge";

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const post = blogPosts.find((p) => p.slug === slug);

    if (!post) {
        return { title: "Blog Post" };
    }

    return {
        title: post.title,
        description: post.description,
        openGraph: {
            title: post.title,
            description: post.description,
            type: "article",
            publishedTime: post.date,
            tags: post.tags,
            images: [
                {
                    url: "/og-image.png",
                    width: 1280,
                    height: 720,
                    alt: post.title,
                },
            ],
        },
        twitter: {
            title: post.title,
            description: post.description,
            images: ["/og-image.png"],
        },
        alternates: { canonical: `/docs/blog/${slug}` },
    };
}

export default async function BlogPostLayout({ children, params }) {
    const { slug } = await params;
    const post = blogPosts.find((p) => p.slug === slug);

    let jsonLd = null;
    if (post) {
        jsonLd = {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            author: {
                "@type": "Organization",
                name: "Elixpo",
                url: "https://elixpo.com",
            },
            publisher: {
                "@type": "Organization",
                name: "Elixpo",
                logo: {
                    "@type": "ImageObject",
                    url: "https://sketch.elixpo.com/icon.png",
                },
            },
            image: "https://sketch.elixpo.com/og-image.png",
        };
    }

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            {children}
        </>
    );
}
