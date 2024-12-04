// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC8Gg-j0WJG7_gyCrT0cWYUlk1m3CjN-bU",
    authDomain: "ticketmanager-5ea42.firebaseapp.com",
    projectId: "ticketmanager-5ea42",
    storageBucket: "ticketmanager-5ea42.firebasestorage.app",
    messagingSenderId: "1097160547250",
    appId: "1:1097160547250:web:8013af1ea830049f4522ab",
    measurementId: "G-MKYTZKSR5K"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Utility functions
function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Get the next available ticket number
async function getNextTicketNumber() {
    const snapshot = await db.collection('tickets')
        .orderBy('ticketNumber', 'desc')
        .limit(1)
        .get();
    
    if (snapshot.empty) {
        return 1;
    }
    return snapshot.docs[0].data().ticketNumber + 1;
}


// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Main functions

async function syncWithGoogleSheets() {
    try {
        showLoading();
        
        // Get all tickets
        const ticketsSnapshot = await db.collection('tickets')
            .orderBy('ticketNumber')
            .get();
        const tickets = ticketsSnapshot.docs.map(doc => doc.data());

        // Get all sellers with calculated revenue
        const sellersSnapshot = await db.collection('sellers').get();
        const sellers = [];
        
        for (const doc of sellersSnapshot.docs) {
            const seller = doc.data();
            const sellerTickets = await db.collection('tickets')
                .where('sellerId', '==', doc.id)
                .where('sold', '==', true)
                .get();
            
            let revenue = 0;
            sellerTickets.forEach(ticketDoc => {
                const ticket = ticketDoc.data();
                revenue += ticket.price;
            });
            
            sellers.push({
                ...seller,
                revenue: revenue
            });
        }

        // Replace this URL with your Google Apps Script Web App URL
        const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxSPOVIpPMVa6jfSnklyfWonDbmzzcjVbzLiCSEJ0SBetsQIbNYM7ycgZk17D8sFSci/exec';

        // Update tickets
        const ticketResponse = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateTickets',
                tickets: tickets
            })
        });

        if (!ticketResponse.ok) {
            throw new Error('Failed to update tickets in Google Sheets');
        }

        // Update sellers
        const sellerResponse = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateSellers',
                sellers: sellers
            })
        });

        if (!sellerResponse.ok) {
            throw new Error('Failed to update sellers in Google Sheets');
        }

        showToast('Successfully synced with Google Sheets');
    } catch (error) {
        console.error('Error syncing with Google Sheets:', error);
        showToast('Error syncing with Google Sheets');
    }
    hideLoading();
}

async function createTickets() {
    const count = parseInt(document.getElementById('ticketCount').value);
    const price = parseFloat(document.getElementById('ticketPrice').value);

    if (!count || !price) {
        showToast('Please enter valid ticket count and price');
        return;
    }

    showLoading();
    try {
        let nextTicketNumber = await getNextTicketNumber();
        const batch = db.batch();

        for (let i = 0; i < count; i++) {
            const ticketRef = db.collection('tickets').doc();
            batch.set(ticketRef, {
                ticketNumber: nextTicketNumber + i,
                price: price,
                assigned: false,
                sold: false,
                sellerId: null,
                sellerName: null,
                assignedDate: null,
                soldDate: null
            });
        }

        await batch.commit();
        showToast(`Created ${count} tickets successfully`);
        updateUI();
    } catch (error) {
        console.error('Error creating tickets:', error);
        showToast('Error creating tickets');
    }
    hideLoading();
    document.getElementById('ticketCount').value = '';
    document.getElementById('ticketPrice').value = '';
}

async function addSeller() {
    const name = document.getElementById('sellerName').value.trim();
    if (!name) {
        showToast('Please enter a seller name');
        return;
    }

    showLoading();
    try {
        await db.collection('sellers').add({
            name: name,
            assignedTickets: [],
            soldTickets: []
        });
        showToast(`Added seller ${name} successfully`);
        updateUI();
    } catch (error) {
        console.error('Error adding seller:', error);
        showToast('Error adding seller');
    }
    hideLoading();
    document.getElementById('sellerName').value = '';
}

async function showAvailableTickets(sellerId) {
    if (!sellerId) {
        showToast('Please select a seller first');
        return;
    }

    try {
        showLoading();
        const ticketsSnapshot = await db.collection('tickets')
            .where('assigned', '==', false)
            .orderBy('ticketNumber')
            .get();

        const modalHtml = `
            <div id="ticketModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Available Tickets</h2>
                        <button onclick="closeModal()" class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="ticket-selection">
                            ${ticketsSnapshot.empty ? 
                                '<p>No tickets available</p>' :
                                ticketsSnapshot.docs.map(doc => {
                                    const ticket = doc.data();
                                    return `
                                        <div class="ticket-checkbox">
                                            <input type="checkbox" 
                                                id="ticket-${ticket.ticketNumber}" 
                                                value="${doc.id}"
                                                data-ticket-number="${ticket.ticketNumber}">
                                            <label for="ticket-${ticket.ticketNumber}">
                                                Ticket #${ticket.ticketNumber} - $${ticket.price}
                                            </label>
                                        </div>
                                    `;
                                }).join('')
                            }
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button onclick="closeModal()" class="cancel-btn">Cancel</button>
                        <button onclick="assignSelectedTickets('${sellerId}')" class="assign-btn">
                            Assign Selected
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        hideLoading();
    } catch (error) {
        console.error('Error loading available tickets:', error);
        showToast('Error loading available tickets');
        hideLoading();
    }
}

async function showSellerTickets(sellerId, mode = 'update') {
    if (!sellerId) {
        showToast('Please select a seller first');
        return;
    }

    try {
        showLoading();
        let ticketsQuery;
        
        if (mode === 'update') {
            ticketsQuery = await db.collection('tickets')
                .where('sellerId', '==', sellerId)
                .where('sold', '==', false)
                .orderBy('ticketNumber')
                .get();
        } else if (mode === 'unassign') {
            ticketsQuery = await db.collection('tickets')
                .where('sellerId', '==', sellerId)
                .where('sold', '==', false)
                .orderBy('ticketNumber')
                .get();
        }

        const modalTitle = mode === 'update' ? 'Mark Tickets as Sold' : 'Unassign Tickets';
        const actionButton = mode === 'update' ? 'Mark as Sold' : 'Unassign Selected';
        const actionFunction = mode === 'update' ? 'markTicketsAsSold' : 'unassignSelectedTickets';

        const modalHtml = `
            <div id="ticketModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${modalTitle}</h2>
                        <button onclick="closeModal()" class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="ticket-selection">
                            ${ticketsQuery.empty ? 
                                '<p>No tickets available</p>' :
                                ticketsQuery.docs.map(doc => {
                                    const ticket = doc.data();
                                    return `
                                        <div class="ticket-checkbox">
                                            <input type="checkbox" 
                                                id="ticket-${ticket.ticketNumber}" 
                                                value="${doc.id}"
                                                data-ticket-number="${ticket.ticketNumber}">
                                            <label for="ticket-${ticket.ticketNumber}">
                                                Ticket #${ticket.ticketNumber} - $${ticket.price}
                                            </label>
                                        </div>
                                    `;
                                }).join('')
                            }
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button onclick="closeModal()" class="cancel-btn">Cancel</button>
                        <button onclick="${actionFunction}('${sellerId}')" class="assign-btn">
                            ${actionButton}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        hideLoading();
    } catch (error) {
        console.error('Error loading tickets:', error);
        showToast('Error loading tickets');
        hideLoading();
    }
}

function closeModal() {
    const modal = document.getElementById('ticketModal');
    if (modal) {
        modal.remove();
    }
}

async function assignSelectedTickets(sellerId) {
    const selectedTickets = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => ({
            id: checkbox.value,
            number: parseInt(checkbox.dataset.ticketNumber)
        }));

    if (selectedTickets.length === 0) {
        showToast('Please select tickets to assign');
        return;
    }

    showLoading();
    try {
        const sellerDoc = await db.collection('sellers').doc(sellerId).get();
        const seller = sellerDoc.data();
        const batch = db.batch();

        selectedTickets.forEach(ticket => {
            const ticketRef = db.collection('tickets').doc(ticket.id);
            batch.update(ticketRef, {
                assigned: true,
                sellerId: sellerId,
                sellerName: seller.name,
                assignedDate: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        const ticketNumbers = selectedTickets.map(t => t.number);
        batch.update(sellerDoc.ref, {
            assignedTickets: firebase.firestore.FieldValue.arrayUnion(...ticketNumbers)
        });

        await batch.commit();
        showToast(`Assigned tickets ${ticketNumbers.join(', ')} to ${seller.name}`);
        closeModal();
        updateUI();
    } catch (error) {
        console.error('Error assigning tickets:', error);
        showToast('Error assigning tickets');
    }
    hideLoading();
}

async function markTicketsAsSold(sellerId) {
    const selectedTickets = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => ({
            id: checkbox.value,
            number: parseInt(checkbox.dataset.ticketNumber)
        }));

    if (selectedTickets.length === 0) {
        showToast('Please select tickets to mark as sold');
        return;
    }

    showLoading();
    try {
        const sellerDoc = await db.collection('sellers').doc(sellerId).get();
        const seller = sellerDoc.data();
        const batch = db.batch();

        const ticketNumbers = selectedTickets.map(t => t.number);
        
        // Update tickets
        selectedTickets.forEach(ticket => {
            const ticketRef = db.collection('tickets').doc(ticket.id);
            batch.update(ticketRef, {
                sold: true,
                soldDate: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        // Remove sold tickets from assignedTickets and add to soldTickets
        const updatedAssignedTickets = seller.assignedTickets.filter(
            ticketNum => !ticketNumbers.includes(ticketNum)
        );

        batch.update(sellerDoc.ref, {
            assignedTickets: updatedAssignedTickets,
            soldTickets: firebase.firestore.FieldValue.arrayUnion(...ticketNumbers)
        });

        await batch.commit();
        showToast(`Marked tickets ${ticketNumbers.join(', ')} as sold`);
        closeModal();
        updateUI();
    } catch (error) {
        console.error('Error marking tickets as sold:', error);
        showToast('Error updating sales');
    }
    hideLoading();
}

async function unassignSelectedTickets(sellerId) {
    const selectedTickets = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => ({
            id: checkbox.value,
            number: parseInt(checkbox.dataset.ticketNumber)
        }));

    if (selectedTickets.length === 0) {
        showToast('Please select tickets to unassign');
        return;
    }

    showLoading();
    try {
        const sellerDoc = await db.collection('sellers').doc(sellerId).get();
        const seller = sellerDoc.data();
        const batch = db.batch();

        const ticketNumbers = selectedTickets.map(t => t.number);
        
        selectedTickets.forEach(ticket => {
            const ticketRef = db.collection('tickets').doc(ticket.id);
            batch.update(ticketRef, {
                assigned: false,
                sellerId: null,
                sellerName: null,
                assignedDate: null
            });
        });

        batch.update(sellerDoc.ref, {
            assignedTickets: seller.assignedTickets.filter(t => !ticketNumbers.includes(t))
        });

        await batch.commit();
        showToast(`Unassigned tickets ${ticketNumbers.join(', ')}`);
        closeModal();
        updateUI();
    } catch (error) {
        console.error('Error unassigning tickets:', error);
        showToast('Error unassigning tickets');
    }
    hideLoading();
}

async function updateUI() {
    try {
        // Update stats
        const ticketsSnapshot = await db.collection('tickets').get();
        const soldTicketsSnapshot = await db.collection('tickets').where('sold', '==', true).get();
        
        let totalRevenue = 0;
        soldTicketsSnapshot.forEach(doc => {
            const ticket = doc.data();
            totalRevenue += ticket.price;
        });

        document.getElementById('totalTickets').textContent = ticketsSnapshot.size;
        document.getElementById('ticketsSold').textContent = soldTicketsSnapshot.size;
        document.getElementById('totalRevenue').textContent = `$${totalRevenue.toFixed(2)}`;

        // Update seller dropdowns
        const sellersSnapshot = await db.collection('sellers').get();
        const sellerDropdowns = ['sellerSelect', 'sellerUpdateSelect'];
        
        sellerDropdowns.forEach(dropdownId => {
            const dropdown = document.getElementById(dropdownId);
            dropdown.innerHTML = '<option value="">Select Seller</option>';
            sellersSnapshot.forEach(doc => {
                const seller = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = seller.name;
                dropdown.appendChild(option);
            });
        });

        // Update seller stats
        const statsContainer = document.getElementById('sellerStats');
        statsContainer.innerHTML = '';
        
        for (const doc of sellersSnapshot.docs) {
            const seller = doc.data();
            const sellerTickets = await db.collection('tickets')
                .where('sellerId', '==', doc.id)
                .where('sold', '==', true)
                .get();
            
            let sellerRevenue = 0;
            sellerTickets.forEach(ticketDoc => {
                const ticket = ticketDoc.data();
                sellerRevenue += ticket.price;
            });

            const sellerCard = document.createElement('div');
            sellerCard.className = 'seller-card';
            sellerCard.innerHTML = `
                <div class="seller-name">${seller.name}</div>
                <div>
                    <strong>Assigned Tickets:</strong>
                    <div class="ticket-list">
                        ${seller.assignedTickets.length > 0 ? 
                            seller.assignedTickets
                                .sort((a, b) => a - b)
                                .map(ticketNum => 
                                    `<span class="ticket-item">Ticket #${ticketNum}</span>`
                                ).join('') : 
                            'No tickets assigned'
                        }
                    </div>
                </div>
                <div>
                    <strong>Sold Tickets:</strong>
                    <div class="ticket-list">
                        ${seller.soldTickets.length > 0 ? 
                            seller.soldTickets
                                .sort((a, b) => a - b)
                                .map(ticketNum => 
                                    `<span class="ticket-item sold">Ticket #${ticketNum}</span>`
                                ).join('') : 
                            'No tickets sold'
                        }
                    </div>
                </div>
                <div class="seller-revenue">
                    Revenue: $${sellerRevenue.toFixed(2)}
                </div>
            `;
            statsContainer.appendChild(sellerCard);
        }
    } catch (error) {
        console.error('Error updating UI:', error);
        showToast('Error updating display');
    }
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', function() {
    updateUI();
});