#!/usr/bin/env node
/**
 * Roda um comando com um Java FUNCIONAL no PATH.
 *
 * Por que isso existe: `firebase-tools` invoca `spawn("java", ...)` cru — resolve pelo
 * PATH e ignora `JAVA_HOME`. Nesta máquina (e é um modo de falha comum no Windows) o
 * PATH do SISTEMA aponta primeiro para stubs quebrados da Oracle
 * (`Common Files\Oracle\Java\javapath`) e para JDKs que perderam a pasta `bin/`. O
 * `java.exe` encontrado existe mas morre com `0xC0000409` (3221226505) antes de
 * imprimir a versão. Corrigir o PATH do sistema exige admin; este wrapper não.
 *
 * Consequência real: `npm run test:rules` ficou impossível de rodar por meses, e é
 * justamente o teste que pegaria o padrão de bug mais caro deste projeto — campo/valor
 * novo num payload do Firestore sem atualizar `firestore.rules` (3 incidentes até hoje).
 *
 * Estratégia: testa `java -version` nos candidatos, em ordem, e usa o primeiro que sair
 * com código 0. Se nenhum funcionar, falha com uma mensagem que diz o que instalar.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { homedir } from 'node:os';

const isWindows = process.platform === 'win32';
const javaBin = isWindows ? 'java.exe' : 'java';

/** Um `java.exe` pode existir e ainda assim não executar (stub órfão). Só confia em exit 0. */
function javaWorks(javaPath) {
  const result = spawnSync(javaPath, ['-version'], { stdio: 'ignore', windowsHide: true });
  return result.error === undefined && result.status === 0;
}

/** Todos os `java` sob `<dir>/<qualquer>/bin/` — cobre JDKs instalados lado a lado. */
function jdksUnder(parentDir) {
  if (!existsSync(parentDir)) return [];
  try {
    return readdirSync(parentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parentDir, entry.name, 'bin', javaBin))
      .filter(existsSync);
  } catch {
    return [];
  }
}

function candidates() {
  const found = [];

  if (process.env.JAVA_HOME) {
    found.push(join(process.env.JAVA_HOME, 'bin', javaBin));
  }

  // `java` do PATH: pode ser o stub quebrado, por isso não tem prioridade sobre JAVA_HOME.
  found.push(javaBin);

  found.push(...jdksUnder(join(homedir(), 'tools', 'jdk')));

  if (isWindows) {
    found.push(...jdksUnder('C:\\Program Files\\Eclipse Adoptium'));
    found.push(...jdksUnder('C:\\Program Files\\Microsoft\\jdk'));
    found.push(...jdksUnder('C:\\Program Files\\Java'));
    found.push(...jdksUnder('C:\\Program Files\\Amazon Corretto'));
  } else {
    found.push(...jdksUnder('/usr/lib/jvm'));
    found.push(...jdksUnder('/Library/Java/JavaVirtualMachines'));
  }

  return found;
}

function resolveJava() {
  for (const candidate of candidates()) {
    if (candidate !== javaBin && !existsSync(candidate)) continue;
    if (javaWorks(candidate)) return candidate;
  }
  return null;
}

const [command, ...args] = process.argv.slice(2);
const shellNeeded = isWindows;

if (!command) {
  console.error('uso: node scripts/with-java.mjs <comando> [args...]');
  process.exit(2);
}

const java = resolveJava();

if (!java) {
  console.error(
    [
      'Nenhum Java funcional encontrado.',
      '',
      'O emulador do Firebase precisa de Java 11 ou superior. Um `java.exe` no PATH que',
      'existe mas falha ao rodar (código 3221226505 / 0xC0000409 no Windows) é um stub',
      'órfão — normalmente sobra de uma desinstalação parcial da Oracle.',
      '',
      'Instale um JDK e rode de novo. Sem precisar de admin, no Windows:',
      '  curl -sSL -o %USERPROFILE%\\tools\\temurin21.zip "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"',
      '  tar -xf %USERPROFILE%\\tools\\temurin21.zip -C %USERPROFILE%\\tools\\jdk',
      '',
      'Este wrapper acha automaticamente qualquer JDK em %USERPROFILE%\\tools\\jdk.'
    ].join('\n')
  );
  process.exit(1);
}

// `java` continua sendo resolvido pelo PATH pelos filhos (firebase-tools spawna "java"
// literal), então basta colocar o bin do JDK bom na FRENTE.
const env = { ...process.env };
if (java !== javaBin) {
  const javaDir = dirname(java);
  env.PATH = `${javaDir}${delimiter}${process.env.PATH ?? ''}`;
  env.Path = env.PATH;
  env.JAVA_HOME = dirname(javaDir);
}

// `shell: true` é necessário no Windows pra achar `firebase.cmd`, mas o Node não cita
// os argumentos por você nesse modo — sem isso, `emulators:exec "vitest run ..."` chega
// no cmd.exe partido em vários argumentos.
const quotedArgs =
  isWindows && shellNeeded
    ? args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg))
    : args;

const child = spawn(command, quotedArgs, { stdio: 'inherit', env, shell: shellNeeded });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
child.on('error', (error) => {
  console.error(`Falha ao rodar "${command}": ${error.message}`);
  process.exit(1);
});
