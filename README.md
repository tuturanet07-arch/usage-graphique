# usage-graphique

Un mod pour Claude Code qui ouvre un panneau « Utilisation quotidienne » : un graphique linéaire du cumul des tokens heure par heure pour aujourd'hui, hier et il y a 7 jours, avec un résumé qui compare la consommation à la même heure. Des boutons filtrent par source : Tout, Claude Desktop (onglet Code de l'app) et Claude Code (terminal ou éditeur).

Les chiffres viennent des transcripts Claude Code enregistrés sur la machine (`~/.claude/projects`), additionnés par un petit script Python (`python3` requis). Tokens = entrée + écriture de cache + sortie. Les conversations du chat Claude Desktop ne sont pas incluses : elles ne sont pas stockées en local. La commande `/usage-graphique` rouvre le panneau.

## Installation

Dans une session Claude Code au terminal :

```
/plugin install usage-graphique --marketplace tuturanet07-arch/usage-graphique
```

Depuis un shell :

```
claude plugin install usage-graphique --marketplace tuturanet07-arch/usage-graphique
```

Dans l'app de bureau, où `/plugin` ne fonctionne pas : cliquez sur + à côté de la zone de saisie, puis Plugins, Add marketplace avec `tuturanet07-arch/usage-graphique`, puis Add plugin.

Répondez `y` pour ajouter le marketplace, puis choisissez la portée (utilisateur par défaut).

## Licence

MIT
