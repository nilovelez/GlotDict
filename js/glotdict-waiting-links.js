'use strict';

/**
 * Number of project pages fetched at the same time
 */
const gd_waiting_links_concurrency = 2;

/**
 * Adds to every project card of the Waiting tab (and of the listings sorted by
 * Waiting + Fuzzy) the sub-projects that have waiting or fuzzy strings, with
 * direct links to those strings.
 * @returns {void}
 */
function gd_waiting_links() {
	if ( ! gd_waiting_links_applies() ) {
		return;
	}
	document.body.classList.add( 'gd-waiting-links-page' );

	const cards = Array.from( document.querySelectorAll( '#projects .project' ) );
	const queue = cards.filter( ( card ) => null !== card.querySelector( '.project-name a' ) );
	queue.forEach( ( card ) => {
		gd_waiting_links_box( card, 'gd-waiting-links-loading' ).textContent = 'Loading sub-projects…';
	} );

	// Fetch the project pages a few at a time, never all at once.
	const next = () => {
		const card = queue.shift();
		if ( ! card ) {
			return Promise.resolve();
		}
		return gd_waiting_links_card( card ).then( next );
	};
	for ( let i = 0; i < gd_waiting_links_concurrency; i++ ) {
		next();
	}
}

/**
 * Whether the current page is a project listing of a locale that shows waiting
 * and fuzzy strings: the Waiting tab, or a listing sorted by Waiting + Fuzzy.
 * @returns {boolean}
 */
function gd_waiting_links_applies() {
	if ( ! /^\/locale\/[^/]+\//.test( window.location.pathname ) ) {
		return false;
	}
	// The Waiting tab is also the default tab of the locale page for editors
	// (/locale/<locale>/, /locale/<locale>/<set>/ and their pages), so check the
	// active tab, not the URL.
	const tab = document.querySelector( 'a.current[href^="/locale/"]' );
	if ( null !== tab && /\/waiting\/?$/.test( tab.getAttribute( 'href' ) ) ) {
		return true;
	}
	const filter = new URLSearchParams( window.location.search ).get( 'filter' ) || '';
	return 0 === filter.indexOf( 'strings-waiting-and-fuzzy' );
}

/**
 * Returns the box for the sub-projects of a project card, creating it if needed
 * @param {HTMLElement} card The project card
 * @param {string} state CSS class for the current state of the box
 * @returns {HTMLElement}
 */
function gd_waiting_links_box( card, state ) {
	let box = card.querySelector( '.gd-waiting-links' );
	if ( null === box ) {
		box = document.createElement( 'DIV' );
		const bottom = card.querySelector( '.project-bottom' );
		if ( null !== bottom ) {
			bottom.before( box );
		} else {
			card.appendChild( box );
		}
	}
	box.className = `gd-waiting-links ${state}`;
	box.textContent = '';
	return box;
}

/**
 * Fetches the project page of a card and adds its sub-projects to the card
 * @param {HTMLElement} card The project card
 * @returns {Promise}
 */
function gd_waiting_links_card( card ) {
	const url = card.querySelector( '.project-name a' ).href;
	return fetch( url, { credentials: 'same-origin' } )
		.then( ( response ) => {
			if ( ! response.ok ) {
				throw new Error( response.status );
			}
			return response.text();
		} )
		.then( ( html ) => {
			const page = new DOMParser().parseFromString( html, 'text/html' );
			gd_waiting_links_render( card, gd_waiting_links_parse( page ) );
		} )
		.catch( () => {
			gd_waiting_links_box( card, 'gd-waiting-links-error' ).textContent = 'Could not load the sub-projects.';
		} );
}

/**
 * Reads the sub-projects with waiting or fuzzy strings from a project page
 * @param {Document} page The project page in the locale
 * @returns {Array} Sub-projects, each with name, waiting and fuzzy
 */
function gd_waiting_links_parse( page ) {
	const sub_projects = [];
	page.querySelectorAll( 'table.locale-sub-projects tbody tr' ).forEach( ( row ) => {
		const name = row.querySelector( 'td.set-name a' );
		if ( null === name ) {
			return;
		}
		const sub_project = {
			// "Stable (latest release)" is shown as "Stable".
			name:    name.textContent.replace( /\s*\([^)]*\)\s*$/, '' ).trim(),
			waiting: gd_waiting_links_count( row.querySelector( 'td.waiting a' ) ),
			fuzzy:   gd_waiting_links_count( row.querySelector( 'td.fuzzy a' ) ),
		};
		if ( sub_project.waiting.count > 0 || sub_project.fuzzy.count > 0 ) {
			sub_projects.push( sub_project );
		}
	} );
	return sub_projects;
}

/**
 * Reads a count link of the sub-projects table
 * @param {HTMLElement|null} link The link with the count
 * @returns {Object} The count, as a number and as shown on the page, and the link's URL
 */
function gd_waiting_links_count( link ) {
	if ( null === link ) {
		return { count: 0, text: '0', url: '' };
	}
	const text = link.textContent.trim();
	return {
		count: parseInt( text.replace( /\D/g, '' ), 10 ) || 0,
		text,
		url:   link.getAttribute( 'href' ),
	};
}

/**
 * Adds the sub-projects to a project card, as a table
 * @param {HTMLElement} card The project card
 * @param {Array} sub_projects Sub-projects returned by gd_waiting_links_parse()
 * @returns {void}
 */
function gd_waiting_links_render( card, sub_projects ) {
	const box = gd_waiting_links_box( card, 'gd-waiting-links-done' );
	if ( ! sub_projects.length ) {
		box.textContent = 'No sub-projects with waiting or fuzzy strings.';
		return;
	}

	const table = document.createElement( 'TABLE' );
	const head = table.createTHead().insertRow();
	[ '', 'Waiting', 'Fuzzy' ].forEach( ( label ) => {
		const cell = document.createElement( 'TH' );
		cell.textContent = label;
		head.appendChild( cell );
	} );

	const body = table.createTBody();
	sub_projects.forEach( ( sub_project ) => {
		const row = body.insertRow();
		const name = document.createElement( 'TH' );
		name.scope = 'row';
		name.textContent = sub_project.name;
		row.appendChild( name );
		row.appendChild( gd_waiting_links_state( sub_project.waiting ) );
		row.appendChild( gd_waiting_links_state( sub_project.fuzzy ) );
	} );
	box.appendChild( table );
}

/**
 * Builds the table cell with the count of a sub-project in one state
 * @param {Object} state Count and URL returned by gd_waiting_links_count()
 * @returns {HTMLElement} The cell: a link to the strings, or empty when there are none
 */
function gd_waiting_links_state( state ) {
	const cell = document.createElement( 'TD' );
	if ( state.count > 0 ) {
		const link = document.createElement( 'A' );
		link.href = state.url;
		link.textContent = state.text;
		cell.appendChild( link );
	}
	return cell;
}
