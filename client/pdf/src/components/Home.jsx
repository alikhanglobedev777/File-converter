import { useState } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowRight, FiArrowUpRight, FiCheck, FiChevronRight,
  FiDownload, FiFileText, FiGrid, FiLayers, FiUploadCloud, FiZap, FiSearch, FiX,
} from "react-icons/fi";
import { services } from "../data/services";
import ToolCard from "./ToolCard";

const filters = ["All tools", "PDF tools", "Excel tools", "File utilities"];

export default function Home() {
  const [filter, setFilter] = useState("All tools");
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visibleServices = services.filter(tool =>
    (filter === 'All tools' || tool.category === filter) &&
    (!query || [tool.title, tool.from, tool.to, tool.description, tool.category].some(value => value.toLowerCase().includes(query)))
  );

  return (
    <div className="page dashboard-page">
      <section className="hero-panel">
        <div className="hero-panel__content">
          <span className="eyebrow eyebrow--light"><span className="eyebrow__dot" /> ONE WORKSPACE. EVERY FILE.</span>
          <h1>Make more of <br /><span>every file.</span></h1>
          <p>Convert PDFs, work with spreadsheets, and keep your documents organized. All the everyday tools you need, in one easy place.</p>
          <div className="hero-panel__actions">
            <a className="button button--white" href="#tools">Explore all tools <FiArrowRight aria-hidden="true" /></a>
            <Link className="button button--glass" to="/pdf-to-excel">Start converting <FiArrowUpRight aria-hidden="true" /></Link>
          </div>
          <div className="hero-panel__foot"><span><FiCheck /> Easy to use</span><span><FiCheck /> No sign-in needed to convert</span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art__ring hero-art__ring--outer" />
          <div className="hero-art__ring hero-art__ring--inner" />
          <div className="hero-art__doc hero-art__doc--back"><FiFileText /><span>PDF</span><i /></div>
          <div className="hero-art__connector"><FiArrowRight /></div>
          <div className="hero-art__doc hero-art__doc--front"><FiGrid /><span>XLSX</span><i /><i /><i /></div>
          <div className="hero-art__badge"><FiCheck /> Ready to download</div>
        </div>
      </section>

      <div className="overview-strip" aria-label="Platform benefits">
        <div className="overview-strip__item"><span className="overview-strip__icon"><FiGrid /></span><div><strong>{services.length} helpful tools</strong><small>All your essentials</small></div></div>
        <div className="overview-strip__item"><span className="overview-strip__icon"><FiZap /></span><div><strong>Simple workflow</strong><small>Upload, convert, download</small></div></div>
        <div className="overview-strip__item"><span className="overview-strip__icon"><FiLayers /></span><div><strong>One workspace</strong><small>Conversions and file utilities</small></div></div>
      </div>

      <section className="tools-section" id="tools">
        <div className="section-heading">
          <div><span className="eyebrow">YOUR TOOLKIT</span><h2>What do you want to do?</h2><p>Pick a tool to get started. Your next file is just a few clicks away.</p></div>
          <span className="section-heading__count">{services.length} tools available <FiChevronRight aria-hidden="true" /></span>
        </div>
        <div className="tool-search">
          <FiSearch aria-hidden="true" />
          <input type="search" aria-label="Search converter tools" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for PDF, Excel, images, split, compress…" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><FiX aria-hidden="true" /></button>}
        </div>
        <div className="tool-filters" role="group" aria-label="Filter tools">
          {filters.map((name) => <button key={name} type="button" className={`tool-filters__button ${filter === name ? "tool-filters__button--active" : ""}`} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}
        </div>
        {visibleServices.length ? <div className="tool-grid">{visibleServices.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div> : <div className="empty-tools"><strong>No matching tools</strong><p>Try a different keyword or choose “All tools”.</p><button type="button" className="button button--primary" onClick={() => { setFilter('All tools'); setSearch(''); }}>Show all tools</button></div>}
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="section-heading"><div><span className="eyebrow">HOW IT WORKS</span><h2>Three steps. That's it.</h2><p>Spend less time switching tools and more time getting things done.</p></div></div>
        <div className="steps-grid">
          <div className="step-card"><span className="step-card__number">01</span><div className="step-card__icon"><FiUploadCloud /></div><h3>Choose your file</h3><p>Pick a tool, then browse or drop in the file you want to work with.</p></div>
          <div className="step-card"><span className="step-card__number">02</span><div className="step-card__icon"><FiZap /></div><h3>We process it</h3><p>The conversion runs using the format you've selected.</p></div>
          <div className="step-card"><span className="step-card__number">03</span><div className="step-card__icon"><FiDownload /></div><h3>Download the result</h3><p>Once it's ready, your browser downloads the finished file.</p></div>
        </div>
      </section>

      <section className="banner-cta"><span className="banner-cta__icon"><FiFileText /></span><div><h2>Got a PDF to work with?</h2><p>Turn it into an editable spreadsheet, a Word file, or images.</p></div><Link to="/pdf-to-excel" className="button button--primary">Convert a PDF <FiArrowRight aria-hidden="true" /></Link></section>
    </div>
  );
}
