from __future__ import annotations

from collections import Counter

from courses.library import Course, COURSES

SKILL_KEYWORDS: dict[str, list[str]] = {
    "python":               ["python", "pytorch", "pandas", "numpy", "scikit", "pyspark", "fastapi", "django", "flask"],
    "machine_learning":     ["machine learning", "ml engineer", "mlops", "scikit-learn", "model training", "feature engineering", "gradient boost", "xgboost"],
    "deep_learning":        ["deep learning", "neural network", "pytorch", "tensorflow", "transformer", "computer vision", "cnn", "rnn", "lstm"],
    "llm":                  ["llm", "large language model", "gpt", "langchain", "llama", "rag", "retrieval augmented", "vector search", "embedding", "fine-tun", "openai", "anthropic", "claude"],
    "nlp":                  ["nlp", "natural language", "text classification", "sentiment", "named entity", "tokeniz", "bert", "t5"],
    "mlops":                ["mlops", "model deploy", "model serving", "model monitoring", "feature store", "kubeflow", "mlflow", "wandb", "bentoml"],
    "data_engineering":     ["data pipeline", "etl", "data warehouse", "data lake", "data lakehouse", "dbt", "airflow", "dagster", "prefect", "spark", "hadoop", "hive"],
    "kafka":                ["kafka", "streaming", "event-driven", "pub/sub", "message queue", "kinesis"],
    "spark":                ["spark", "pyspark", "databricks", "delta lake"],
    "sql":                  ["sql", "postgresql", "mysql", "sqlite", "redshift", "snowflake", "bigquery", "relational database"],
    "nosql":                ["mongodb", "dynamodb", "cassandra", "redis", "elasticsearch", "couchdb", "nosql"],
    "vector_db":            ["vector database", "pinecone", "weaviate", "chroma", "qdrant", "milvus", "pgvector"],
    "aws":                  ["aws", "amazon web services", "s3", "ec2", "lambda", "sagemaker", "rds", "eks", "ecs", "fargate", "cloudwatch"],
    "gcp":                  ["gcp", "google cloud", "bigquery", "vertex ai", "cloud run", "dataflow", "pub/sub", "gke"],
    "kubernetes":           ["kubernetes", "k8s", "helm", "kubectl", "container orchestrat"],
    "docker":               ["docker", "dockerfile", "container", "podman"],
    "terraform":            ["terraform", "infrastructure as code", "pulumi", "cloudformation", "iac"],
    "ci_cd":                ["ci/cd", "github actions", "gitlab ci", "jenkins", "circle ci", "pipeline automation"],
    "typescript":           ["typescript", " ts ", "angular", "nextjs", "next.js", "vue", "svelte"],
    "react":                ["react", "react.js", "reactjs", "hooks", "redux", "recoil", "zustand"],
    "golang":               ["golang", " go ", "go language", "goroutine", "grpc"],
    "system_design":        ["system design", "distributed system", "scalab", "high availability", "fault toleran", "microservice", "event-driven architecture"],
    "security":             ["security", "oauth", "authentication", "authorization", "encryption", "jwt", "penetration test", "cybersecurity", "zero trust"],
    "product_management":   ["product manager", "product roadmap", "product strategy", "okr", "kpi", "stakeholder", "product owner", "agile", "scrum"],
    "analytics":            ["analytics", "tableau", "looker", "metabase", "power bi", "a/b test", "experimentation", "funnel", "retention", "cohort"],
}

SKILL_TO_TAGS: dict[str, list[str]] = {
    "python":             ["python", "pandas", "pytorch"],
    "machine_learning":   ["machine_learning", "scikit_learn", "python"],
    "deep_learning":      ["deep_learning", "python", "pytorch", "tensorflow"],
    "llm":                ["llm", "python", "rag", "langchain", "embeddings"],
    "nlp":                ["nlp", "llm", "transformers", "python"],
    "mlops":              ["mlops", "machine_learning", "python"],
    "data_engineering":   ["data_engineering", "python", "airflow", "spark"],
    "kafka":              ["data_engineering", "kafka", "streaming"],
    "spark":              ["data_engineering", "spark", "python"],
    "sql":                ["sql", "databases", "postgresql"],
    "nosql":              ["mongodb", "nosql", "databases"],
    "vector_db":          ["vector_db", "llm", "embeddings", "databases"],
    "aws":                ["aws", "cloud", "architecture"],
    "gcp":                ["gcp", "data_engineering", "bigquery"],
    "kubernetes":         ["kubernetes", "devops", "docker"],
    "docker":             ["docker", "kubernetes", "devops"],
    "terraform":          ["terraform", "devops", "aws"],
    "ci_cd":              ["devops", "ci_cd", "github"],
    "typescript":         ["typescript", "javascript"],
    "react":              ["react", "typescript", "javascript"],
    "golang":             ["golang"],
    "system_design":      ["system_design", "architecture", "distributed_systems"],
    "security":           ["security", "auth", "api"],
    "product_management": ["product_management", "leadership"],
    "analytics":          ["analytics", "tableau"],
}

_SKILL_LABELS: dict[str, str] = {
    "python":             "Python",
    "machine_learning":   "ML fundamentals",
    "deep_learning":      "deep learning",
    "llm":                "LLMs / RAG",
    "nlp":                "NLP",
    "mlops":              "MLOps",
    "data_engineering":   "data engineering",
    "kafka":              "Kafka / streaming",
    "spark":              "Apache Spark",
    "sql":                "SQL",
    "nosql":              "NoSQL databases",
    "vector_db":          "vector databases",
    "aws":                "AWS",
    "gcp":                "Google Cloud",
    "kubernetes":         "Kubernetes",
    "docker":             "Docker",
    "terraform":          "Terraform / IaC",
    "ci_cd":              "CI/CD",
    "typescript":         "TypeScript",
    "react":              "React",
    "golang":             "Go",
    "system_design":      "system design",
    "security":           "security",
    "product_management": "product management",
    "analytics":          "analytics",
}


def gap_reason(gap: str) -> str:
    """Human-readable label for a skill gap key."""
    return _SKILL_LABELS.get(gap, gap.replace("_", " "))


def extract_skills_from_text(text: str) -> set[str]:
    if not text:
        return set()
    lower = text.lower()
    return {skill for skill, patterns in SKILL_KEYWORDS.items() if any(p in lower for p in patterns)}


def skill_counts_in_texts(texts: list[str]) -> Counter[str]:
    """Count how many texts mention each skill."""
    counts: Counter[str] = Counter()
    for text in texts:
        for skill in extract_skills_from_text(text):
            counts[skill] += 1
    return counts


def detect_gaps(liked_job_texts: list[str], profile_text: str) -> list[str]:
    """Skills that appear frequently in liked jobs but are absent from the user profile."""
    if not liked_job_texts:
        return []
    job_skills = skill_counts_in_texts(liked_job_texts)
    profile_skills = extract_skills_from_text(profile_text or "")
    threshold = max(1, len(liked_job_texts) // 3)
    return [
        skill for skill, count in job_skills.most_common()
        if count >= threshold and skill not in profile_skills
    ]


def recommend_courses(gaps: list[str], limit: int = 3) -> list[Course]:
    return _score_and_rank(gaps)[:limit]


def recommend_all_courses(gaps: list[str], limit: int = 15) -> list[Course]:
    return _score_and_rank(gaps)[:limit]


def course_gap_reason(course: Course, gaps: list[str], skill_counts: Counter[str], total_liked: int) -> str:
    """Generate a human-readable reason tying a course to the user's detected gaps."""
    course_tag_set = set(course.tags)
    covered = [g for g in gaps if set(SKILL_TO_TAGS.get(g, [])) & course_tag_set]
    if not covered:
        return "Recommended based on your activity patterns"
    top_gap = covered[0]
    label = gap_reason(top_gap)
    if total_liked > 0:
        count = skill_counts.get(top_gap, 0)
        pct = round(count / total_liked * 100)
        if pct > 0:
            return f"Adding {label} skills can unlock ~{pct}% more relevant roles"
    return f"Covers {label} — a skill gap in roles you engage with"


def _score_and_rank(gaps: list[str]) -> list[Course]:
    if not gaps:
        return sorted(COURSES, key=lambda c: -c.quality_score)[:20]
    wanted_tags: set[str] = set()
    for gap in gaps:
        wanted_tags.update(SKILL_TO_TAGS.get(gap, [gap]))
    scored = [
        (len(set(c.tags) & wanted_tags) * c.quality_score, c)
        for c in COURSES
        if set(c.tags) & wanted_tags
    ]
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored]
