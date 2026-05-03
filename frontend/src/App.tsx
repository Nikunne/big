import heroImg from './assets/hero.png'
import './App.css'

function App() {
  const badges = ['Certified oversized vibe', 'Questionable domain', 'Very official', 'Open for mail']
  const menuItems = ['Home', 'Flavor', 'Evidence', 'Buy Domain', 'Contact']
  const details = [
    'A small internet monument with a large amount of confidence.',
    'Built for late-night clicks, accidental bookmarks, and serious unseriousness.',
    'No corporate manifesto. Just loud colors, polite chaos, and one email address.',
  ]

  return (
    <main>
      <section className="hero-shell" id="home">
        <nav className="site-nav" aria-label="Primary navigation">
          <a className="brand-mark" href="#home" aria-label="bigdick.fyi home">
            BD.FYI
          </a>
          <div className="nav-links">
            {menuItems.map((item) => (
              <a key={item} href={`#${item.toLowerCase().replaceAll(' ', '-')}`}>
                {item}
              </a>
            ))}
          </div>
        </nav>

        <div className="ticker" aria-hidden="true">
          <span>bigdick.fyi // oddly useful // aggressively online // send snacks //</span>
          <span>bigdick.fyi // oddly useful // aggressively online // send snacks //</span>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Information you did not request</p>
            <h1>bigdick.fyi</h1>
            <p className="lede">
              A tiny official-looking website for an extremely unserious domain.
              Bring questions, rumors, compliments, tiny business cards, and
              tasteful nonsense.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="mailto:contact@bigdick.fyi">
                contact@bigdick.fyi
              </a>
              <a className="secondary-action" href="#evidence">
                Inspect the scene
              </a>
            </div>
          </div>

          <div className="chaos-poster" aria-label="Decorative surreal poster">
            <div className="sunburst"></div>
            <img src={heroImg} alt="" />
            <div className="poster-label label-one">100% fyi</div>
            <div className="poster-label label-two">open 25/8</div>
            <div className="poster-label label-three">big mood desk</div>
          </div>
        </div>
      </section>

      <section className="badge-strip" id="flavor" aria-label="Site highlights">
        {badges.map((badge) => (
          <div className="badge" key={badge}>
            {badge}
          </div>
        ))}
      </section>

      <section className="content-grid" id="evidence">
        <article className="feature-panel tall">
          <span className="panel-number">01</span>
          <h2>What is this?</h2>
          <p>
            A shiny internet placard wearing sunglasses indoors. It is here to
            answer almost nothing and still feel weirdly complete.
          </p>
          <div className="stamp">real website</div>
        </article>

        <article className="feature-panel checker">
          <span className="panel-number">02</span>
          <h2>Why so loud?</h2>
          <p>
            The domain asked politely, then kicked the door open with a confetti
            cannon and a fax machine full of glitter.
          </p>
        </article>

        <aside className="notice-stack" aria-label="Notices">
          {details.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </aside>
      </section>

      <section className="domain-sale" id="buy-domain" aria-labelledby="domain-sale-title">
        <div className="sale-copy">
          <p className="eyebrow">Premium questionable property</p>
          <h2 id="domain-sale-title">Buy bigdick.fyi</h2>
          <p>
            Own the loudest tiny corner of the internet for <strong>$10,000</strong>.
            One domain. Infinite raised eyebrows. Zero boring business cards.
          </p>
        </div>
        <a className="price-ticket" href="mailto:contact@bigdick.fyi?subject=I%20want%20to%20buy%20bigdick.fyi">
          <span>Asking price</span>
          <strong>$10,000</strong>
          <em>serious unserious offers accepted</em>
        </a>
      </section>

      <section className="contact-zone" id="contact">
        <div>
          <p className="eyebrow">Human contact portal</p>
          <h2>Send a message. Make it count, or at least make it weird.</h2>
        </div>
        <a className="mail-card" href="mailto:contact@bigdick.fyi">
          contact@bigdick.fyi
        </a>
      </section>
    </main>
  )
}

export default App
