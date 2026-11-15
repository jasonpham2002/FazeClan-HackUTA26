-- Connect sourced roster identities to the engagement API without duplicating players.
CREATE VIEW engagement_players AS SELECT id FROM esports_players;
