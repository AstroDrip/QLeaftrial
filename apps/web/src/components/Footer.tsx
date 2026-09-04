export function Footer() {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="site-footer__brand"><strong>QLeaves</strong><span>For the love of art and plants.</span></div>
      <span>© {new Date().getFullYear()} QLeaves · Qatar</span>
      <div className="site-footer__links">
        <a href="https://www.instagram.com/qleaves.qa?igsi=MWh6YzR4dWMyazA0cw==" target="_blank" rel="noreferrer">Instagram</a>
        <a href="tel:+97477551056">+974 7755 1056</a>
      </div>
      <span className="site-footer__credit">Built by <strong>QOZYD</strong></span>
    </footer>
  );
}
