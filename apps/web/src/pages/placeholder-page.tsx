type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>WMS Scan</p>
        <h1>{title}</h1>
      </div>
      <div className="placeholder-card">
        <h2>{title} workspace</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
