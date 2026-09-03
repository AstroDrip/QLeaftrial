import { content } from "../../../content/en";

export function AssembledPlantSection() {
  return (
    <section
      className="assembled-section"
      aria-label="Illustrated house plant"
      data-testid="assembled-section"
    >
      <div className="assembled-section__frame">
        <img
          src="/images/hero/leaf-2.svg"
          alt=""
          className="home__fragment assembled-leaf assembled-leaf--left"
          data-testid="fragment-left"
        />
        <img
          src="/images/hero/leaf-1.svg"
          alt=""
          className="home__fragment assembled-leaf assembled-leaf--center"
          data-testid="fragment-center"
        />
        <img
          src="/images/hero/leaf-3.svg"
          alt=""
          className="home__fragment assembled-leaf assembled-leaf--right"
          data-testid="fragment-right"
        />
      </div>
    </section>
  );
}
