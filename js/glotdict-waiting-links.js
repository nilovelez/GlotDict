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
	const path = window.location.pathname;
	if ( /^\/locale\/[^/]+\/[^/]+\/waiting\/?$/.test( path ) ) {
		return true;
	}
	if ( ! /^\/locale\/[^/]+\/[^/]+\/[^/]+\/?$/.test( path ) ) {
		return false;
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
 * @returns {Array} Sub-projects, each with name, url, waiting and fuzzy
 */
function gd_waiting_links_parse( page ) {
	const sub_projects = [];
	page.querySelectorAll( 'table.locale-sub-projects tbody tr' ).forEach( ( row ) => {
		const name = row.querySelector( 'td.set-name a' );
		if ( null === name ) {
			return;
		}
		const sub_project = {
			name:    name.textContent.trim(),
			url:     name.getAttribute( 'href' ),
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
 * Adds the sub-projects to a project card
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

	const list = document.createElement( 'UL' );
	sub_projects.forEach( ( sub_project ) => {
		const item = document.createElement( 'LI' );
		const name = document.createElement( 'A' );
		name.className = 'gd-waiting-links-name';
		name.href = sub_project.url;
		name.textContent = sub_project.name;
		item.appendChild( name );
		item.appendChild( gd_waiting_links_state( 'Waiting', sub_project.waiting ) );
		item.appendChild( gd_waiting_links_state( 'Fuzzy', sub_project.fuzzy ) );
		list.appendChild( item );
	} );
	box.appendChild( list );
}

/**
 * Builds the link to the strings of a sub-project in one state
 * @param {string} label Name of the state
 * @param {Object} state Count and URL returned by gd_waiting_links_count()
 * @returns {HTMLElement} A link, or a plain span when there are no strings
 */
function gd_waiting_links_state( label, state ) {
	const element = document.createElement( state.count > 0 ? 'A' : 'SPAN' );
	element.className = `gd-waiting-links-state gd-waiting-links-${label.toLowerCase()}`;
	element.textContent = `${label}: ${state.text}`;
	if ( state.count > 0 ) {
		element.href = state.url;
	}
	return element;
}
