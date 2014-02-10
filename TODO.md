## Work on comics

- filter and unif formats "comic" "Comic" "Graphic Novel":

```bash
   cat data/comics/* | sed 's/","/",\n"/g' | grep '"format":' | count
```

- complete incomplete creators/characters returned:

```bash
cat data/comics/* | sed 's/","/",\n"/g' | grep '"\(rol\|nam\)e".*"returned":20'
```

- Filter and unif authors by role (remove cover?):

```bash
cat data/comics/* | sed 's/","/",\n"/g' | grep '"role":' | sed 's/"}.*//' | count
```

- Possible networks:
 * authors linked by work on same books
 * links between authors and characters filtered by category of author
 * links between characters appearing on same books

