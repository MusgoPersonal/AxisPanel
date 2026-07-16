<script>
  export let scraperQuery = '';
  export let scraperCategory = 'clinicas_dentales';
  export let availableCategories = [];
  export let scrapingStatus = '';

  export let onRun = () => {};
</script>

<h2>🔍 Google Maps Scraper</h2>
<div class="card">
  <label for="scraper-query">Búsqueda</label>
  <input id="scraper-query" bind:value={scraperQuery} placeholder="Ej. Dentistas, Kinesiólogos" />
  <label for="scraper-category">Categoría</label>
  <select id="scraper-category" bind:value={scraperCategory}>
    {#each availableCategories as cat}<option value={cat.category}>{cat.category} ({cat.count})</option>{/each}
    <option value="clinicas_dentales">Clínicas Dentales</option>
    <option value="otros">Otros</option>
  </select>
  <button class="btn-primary" on:click={onRun}>Ejecutar</button>
  {#if scrapingStatus}<p class="status">{scrapingStatus}</p>{/if}
</div>