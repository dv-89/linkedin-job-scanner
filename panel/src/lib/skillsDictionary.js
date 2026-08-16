// Curated keyword dictionary used for deterministic, reliable matching
// (as opposed to noisy general NLP extraction). Grouped by category for
// display; matching itself is case-insensitive / word-boundary based.
export const SKILLS_DICTIONARY = {
  'Languages': [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust',
    'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Perl',
    'Objective-C', 'Dart', 'Elixir', 'Haskell', 'SQL', 'Bash', 'Shell',
    'PowerShell', 'HTML', 'CSS', 'SASS', 'LESS',
  ],
  'Frameworks & Libraries': [
    'React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Node.js',
    'Express', 'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot',
    'Ruby on Rails', '.NET', 'ASP.NET', 'Laravel', 'jQuery', 'Redux',
    'GraphQL', 'REST', 'gRPC', 'TensorFlow', 'PyTorch', 'Keras',
    'scikit-learn', 'Pandas', 'NumPy', 'jest', 'Cypress', 'Selenium',
    'Playwright', 'Webpack', 'Vite', 'Tailwind',
  ],
  'Cloud & DevOps': [
    'AWS', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform',
    'Ansible', 'Jenkins', 'CI/CD', 'GitHub Actions', 'GitLab CI',
    'CloudFormation', 'Helm', 'Prometheus', 'Grafana', 'Datadog', 'Nginx',
    'Linux', 'Serverless', 'Lambda', 'EC2', 'S3', 'Kafka', 'RabbitMQ',
  ],
  'Databases': [
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle',
    'SQL Server', 'DynamoDB', 'Elasticsearch', 'Cassandra', 'Snowflake',
    'BigQuery', 'Firebase',
  ],
  'Tools & Practices': [
    'Git', 'GitHub', 'GitLab', 'Jira', 'Confluence', 'Figma', 'Postman',
    'Agile', 'Scrum', 'Kanban', 'TDD', 'Unit Testing', 'Microservices',
    'API Design', 'System Design', 'OOP', 'Design Patterns',
    'Data Structures', 'Algorithms', 'A/B Testing',
  ],
  'Soft Skills': [
    'Communication', 'Leadership', 'Collaboration', 'Problem Solving',
    'Critical Thinking', 'Mentoring', 'Stakeholder Management',
    'Project Management', 'Cross-functional', 'Time Management',
    'Adaptability', 'Ownership', 'Presentation',
  ],
}

// Flat list of [term, category] pairs for matching.
export const ALL_SKILLS = Object.entries(SKILLS_DICTIONARY).flatMap(
  ([category, terms]) => terms.map((term) => ({ term, category }))
)
