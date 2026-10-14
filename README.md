# Impostor

Rodzinna gra w impostora na jednym telefonie, który krąży z rąk do rąk. Wszyscy poza impostorem widzą tajne hasło, a impostor dostaje tylko krótką, nieoczywistą podpowiedź. Gra działa bez internetu.

## Uruchomienie (GitHub Pages)

1. Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → Save.
2. Po minucie gra jest pod adresem `https://<login>.github.io/impostor/`.
3. Na telefonie otwórz ten adres i dodaj stronę do ekranu głównego:
   - iPhone: Safari → Udostępnij → „Do ekranu początkowego”,
   - Android: Chrome → menu ⋮ → „Dodaj do ekranu głównego” / „Zainstaluj aplikację”.

Po pierwszym otwarciu gra zapisuje się w telefonie i działa offline. Gdy telefon jest online, sam pobiera nowe hasła i poprawki.

## Tryb testowy

`https://<login>.github.io/impostor/test/` to ta sama gra z kilkoma hasłami na niby. Służy do sprawdzania wyglądu i działania. Nie zużywa haseł z prawdziwej puli i ma własny licznik. Lista graczy jest wspólna.

## Jak gra pamięta hasła

- Hasła są w pliku `words.dat` w formie zakodowanej, żeby nie dało się ich przeczytać przypadkiem.
- Telefon zapamiętuje, które hasła już padły, i losuje tylko spośród nowych. Gdy pula się skończy, zaczyna od nowa.
- Przycisk „Zacznij pulę od nowa” na ekranie startowym zeruje licznik ręcznie.

## Dodawanie haseł (dla osoby, która nie gra)

Skrypt `tools/words.mjs` dopisuje hasła do `words.dat` i nigdy nie wypisuje ich na ekran, chyba że dodasz `--pokaz`.

```sh
node tools/words.mjs stats                  # ile haseł jest w puli
node tools/words.mjs check nowe.json        # sprawdź plik przed dodaniem
node tools/words.mjs add nowe.json          # dopisz do puli (nowe ID, bez duplikatów)
```

`nowe.json` to lista `[{ "w": "Hasło", "h": "podpowiedź" }]`. Podpowiedź ma najwyżej 2 słowa (plus ewentualnie przyimek, np. „w plecaku”). Nie commituj pliku z jawnymi hasłami.
