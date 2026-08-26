# L'API du panthéon, en une seule étape : il n'y a rien à compiler et aucune
# dépendance à installer — `node:sqlite` est fourni par Node lui-même, sans le
# moindre drapeau depuis Node 24 (vérifié sur cette image, v24.19.0). C'est ce
# qui permet de se passer de npm ici, et donc de tout arbre de dépendances à
# surveiller pour un service qui ne sert que du JSON.
FROM node:24-alpine

LABEL org.opencontainers.image.title="HYPERNOVA API" \
      org.opencontainers.image.description="Panthéon partagé de HYPERNOVA : pilotes, parties, classement." \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Seul server/ entre dans l'image. Le jeu, ses textures et sa chaîne de build
# n'ont rien à faire dans un conteneur qui répond à six routes.
COPY --chown=node:node server/ ./

# Le point de montage doit exister et appartenir à l'utilisateur avant que Node
# n'essaie d'y écrire. En production un volume le recouvre ; sans volume (essai
# local, test de fumée de la CI), c'est ce dossier-ci qui accueille la base.
RUN mkdir -p /data && chown node:node /data

# L'utilisateur `node` (uid 1000) existe déjà dans l'image officielle : le
# cluster refuse les conteneurs qui démarrent en root.
USER node

EXPOSE 8081

# Forme exec et pas d'init : Node est PID 1 et reçoit donc SIGTERM directement,
# ce que la fin de index.js attend pour fermer le serveur proprement. Passer par
# un shell ferait disparaître le signal en route.
CMD ["node", "index.js"]
