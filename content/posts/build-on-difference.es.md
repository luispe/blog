---
categories:
- idp
date: "2025-11-01T00:00:00-03:00"
description: El cómo y el porqué de nuestro IDP desde las diferencias
tags:
- platform-engineering
- idp
title: Construir desde las diferencias
toc: true
---


En esta publicación voy intentar contar nuestra experiencia
construyendo el IDP en Akua, que retos sorteamos, estado actual
y lo que queda para el futuro del IDP.

Con [Ger](https://www.linkedin.com/in/geryepes/) a esta altura me
animo a decir que un amigo, nos unimos desde los inicios de Akua
con el objetivo de constuir la plataforma de desarrollo interna,
ambos de experiencias e industrias diferentes pero con una
misma visión profunda sobre lo que necesitaba Akua.

Deje enlace de su linkedin, pero a muy breve --e irrespetuoso resumen--
Ger viene con una experiencia desde el mas bajo nivel en infraestructura
hasta llegar a constuir el equipo y la plataforma en Sate (para los amigos),
[Satellogic](https://www.linkedin.com/company/satellogic/) si nos ponemos
mas serios.

En mi caso arranque mi carrera como desarrollador de producto y ya desde
mi paso por Viacom (Telefé) comencé a sentir una curiosidad muy fuerte
por la infraestructura, en Pomelo pude trabajar a tiempo completo ayudando
a construir el IDP y en Akua ya junto a "mi compa" lo diseñamos y ejecutamos
desde cero con todo el orgullo que eso me provoca.

## Primeros dias y primeros pasos

Comenzamos con una hoja en blanco, literal, no había absolutamente nada
en Akua, una cuenta de AWS pelada pero eso era lo que menos nos preocupaba;
dejo un punteo de "nuestros mantras" que hasta el dia de hoy seguimos
manteniendo y velando porque eso siga sucediendo:

- La operación y mantenimiento de nuestra plataforma debe tender a cero.
- Lo que desarrollemos se tiene que poder probar y testear local sin que sea
un chino poder hacerlo.
- Si funciona en desarrollo tiene que funcionar en producción o en cualquier
ciclo de vida por el que pase el software.
- Todo debe autodescubirse, no "harcodiemos" nada.
- La simpleza ante todo.
- Rompamos con la inercia de experiencias previas.

### Armando las bases

Nos aliamos con Binbash para que ejecute nuestro diseño de redes
compliance con PCI, mientras Ger y yo hacíamos una validación
de que herramienta se iba a adaptar mejor para la gestión de la
infraestructura de nuestro IDP, para ser absolutamente transparentes
evaluamos tres, desde el inicio descartamos una y con las dos restantes
hicimos unas pruebas rapidas de concepto para determinar con cual nos
íbamos a quedar.

Las tres herramientas analizadas:
- **Terraform CDK**, de las tres analizadas la descartamos desde el día cero,
porqué?, terraform venia con una dirección no open source y sumado a eso
vimos (al menos en ese momento) que al proyecto de Terraform CDK
le faltaba una enorme documentación, algo que a Ger y a mí nos
mata por nuetra forma de trabajo.

- **Crossplane**, puede ser tentador utilizar esta herramienta, pero en la
primera de cambio que tengas que agregar algo de lógica en un producto que
provea tu plataforma estas un poco sonado, y seamos honestos, YAML es demasiado
frágil para delegarle la responsabilidad de gestionar los productos que
ofrezca nuestro IDP.

- **Pulumi**, ya te habrás dado cuenta, elegimos Pulumi, nos daba flexibilidad
para poder desarrollar cualquier lógica que queramos, nos abstraía de la
complejidad de manejar el estado de los recursos, su documentación es un lujazo
y tiene una fuerte adopción en la comunidad; lo que nos proyectaba que en caso
futuro si sumamos a mas compas al equipo no se van a encontrar con algo totalmente
desconocido; por último y no menor te ofrece la posibiliad de implementar
dynamic resources osea si hay algun recurso que no este disponible en Pulumi
uno puede implementar la interfaz de Pulumi y gestionar recursos no soportados
por el IaC, en nuestro caso si no recuerdo mal tuvimos que hacerlo en
dos oportunidades con Typensense y "marcas de deployment" en NewRelic.

Quiero hacer una aclaración, ni Ger ni yo habíamos usado de forma productiva a
Pulumi, conocíamos y habíamos testeado la herramienta, pero no habíamos tenido
oportunidad de usarla de forma productiva.

Una vez que elegimos nuestra herramienta de backend pasamos a la siguiente
fase de definición de nuetro IDP, la capa de presentación.

Como dice el título acá pudimos debatir desde las diferencias que íbamos a
ofrecer, Ger desde su experiencia con equipos extremandamente técnicos y que
tienen una necesidad de control de absolutamente todo proponía ofrecer las
abstracciones de los productos de plataforma y que nuestros desarrolladores
usen en sus proyectos dicha abstracción --aka iban a tener que saber manejar pulumi--;
en contraparte mi línea de pensamiento y propuesta era que los
desarrolladores de Akua no íban a sentirse cómodos teniendo que
saber manejar una herramienta de plataforma, debíamos ofrecer una capa
de presentacion --aka portal-- y que desde ahí puedan diseñar la
arquitectura del proyecto y posterior despliegue y gestión.

Acá al igual que nuestra herramienta de backend hoy en día aparecen
varias posibilidades, analizamos dos, Backstage y Port.io,
hay mas claro, pero como siempre buscamos las de mayor adopción en la
industria para que el día de mañana quien ingrese al equipo no se encuentre
con algo que no se usa en ningún lado.

En este caso nos decidimos por Port.io, porqué? Backstage nos obligaba a
tener que desarrollar cosas arriba y en el momento en el que
estabamos no queríamos tocar nada de frontend, no es nuestro fuerte y nos
oblibaga a tener un desvio de tiempos importante que no eran una opción.

En el caso de Port.io no fue por descarte, me gusta hablar de Port como
el Notion de las plataformas, su sistema de Bluperints te permite diseñar
tu plataforma a lo que necesitas y no te obliga a adaptarte a sus decisiones,
la UI es exquisita, brinda acceso por SSO, tiene sistema de RBAC (aun bastante mejorable)
y sumado a Scorecards, Self Service actions, Automations y generación de dashboard
con un par de clicks se convirtió en nuestra herramienta perfecta para la capa
de presentación de nuestra Plataforma que estabamos buscando.

### Stack tecnológico

Desarrollamos un Helm chart a medida para nuestras aplicaciones, con el tiempo
evolucionó y hoy soporta poder desplegar tanto un microservicio o un monorepo con esto
último nos queremos referir a que con un mismo proyecto se puedan desplegar múltiples
servicios en kubernetes sin necesidad de tener "n" proyectos en Gitlab.

Nuestro helm chart (también pensado desde el día cero) esta centralizado y
evoluciona como cualquier software con semver, y nuestros desarrolladores
de producto tienen la libertad de usar x o y version si necesitan
de dicha funcionalidad.

Acá una vez mas nuestro enfoque fue, centralicemos la herramienta y la evolución,
intentando no transferir carga cognitiva a nuestros clientes; asi que en este punto
nuestro helm-chart evoluciona y cada proyecto definie sus values.yaml que en tiempo
de despliegue se utilizan para el despliegue de la(s) aplicación(es).

Para nuestra gestión de ciclo de vida de las aplicaciones usamos gitlab, Ger en este caso
tiene enorme experiencia y nos sirvio un montón para tener runners privados que ejecutan la
sincronización de los recursos de la aplicación sin necesidad de tener credenciales de
acceso a AWS distribuidas en Gitlab, con todo el peligro que ello conlleva.

Hablando de Gitlab, también por experiencias previas, sabemos que realizar cambios
en los pipelines y que todos los proyectos los adopten es un desafío, por eso fuimos
por un esquema de pipelines centralizados y que los proyectos solo hagn el "include"
y no se preocupen de nada mas, en caso de necesitar algo se agrega al pipeline centralizado
y ya todos los proyectos lo tienen disponible, como siempre semver para poder evolucionar
sin comprometer el desarrollo de nuestros clientes.

Creo que ya lo comenté pero para la orquestación y carga de trabajo de nuestras
aplicaciones usamos kubernetes, en este caso con una particularidad, lo usamos
con fargate, propuesta del Ger y por suerte adoptada y pudimos convencer a las
personas necesarias para ir por este camino.

Que ventaja nos da usar fargate? operación de kubernetes casi nula, actualizar la
version de kubernetes es trivial, es PCI compliance, entre otros befenicios.

Tiene sus contras como todo, no se pueden instalar herramienteas en kubernetes
que necesitan desplegar un daemonset, igual mucho no nos preocupa eso porque
(volviendo a uno de nuestros mantras de mantener todo lo mas simple posible),
nuestro cluster de EKS tiene muy muy pocas herramientas o componentes instalados:
- Kong
- Metrics server
- External DNS

Y si, tienen que haber una justificación y ganancia muy alta para instalar
mas herramientas en nuestros clusters.

#### Un momento y los secretos?

Desarrollamos un flujo de trabajo con parameter store que nos permite desplegear
y disponibilizar los secretos a las aplicaciones en kuberentes con la flexibilidad
de que si algun secreto no es manejado por nuestra infra-lib el equipo de seguridad
lo pueda agregar a parameter store y nuestra infra-lib lo deja disponible en la app.


#### Seguridad auth y authz?

Desde el minuto cero para las aplicaciones usamos IRSA (Iam Role for Service Account)
y desplegamos permisos por tag (en breve comento nuestra estrategia de tagging),
y en caso de que el recurso de AWS no lo soporte (s3), nuestra infra-lib tiene
la habilidad de autodescubrir el recurso y asignar los permisos necesarios.

Acabo de hablar de tag y recuerdo que en alguna publicación que hicimos
alguien nos criticó que una plataforma sin finops no puede considerearse como tal,
aprovecho a contestarle que desde el minuto cero todos nuestros recursos de infraestructura
cuentan con tags centralizados manejados por nuestra infra-lib, esto nos va a permitir a
futuro cuando desarrollemos e implementemos el concepto de billing para nuestro IDP
sea todo mas facil al tener nuestro recursos correctamente "taggeados" y le dejo una
breve PD: el gasto de nuestra infraestructura es bastante mas bajo del que habíamos
predicho gracias a las correctas configuraciones por entorno que hace nuestra infra-lib
en los recursos de infraestructura.

Siguiendo con la temática de seguridad, el acceso a los recursos como base de datos
es mediante reglas en los security groups de la app y la DB, asi mismo el acceso
entre aplicaciones está bloqueado a nivel del red aunque esten el mismo namespace,
esto nos permite establecer reglas de acceso entre servicios que son manejadas por
Kong y se configuran de forma fácil desde nuestro portal Port.io.

## Conclusiones

Resta aún comentar un monton de cosas mas: como implementamos scorecards,
acciones del dia 2, despliegue de single tenants, publicación de rutas públicas;
entre otros, pero lo guardo para otra publicación :).

Pero para ir finalizando quiero reflexionar sobre algunos asuntos.

Para comenzar como comenté no en todos los casos estuvimos de
acuerdo con las propuestas traídas por uno u otro, pero
supimos construir una plataforma de desarrollo interna desde
nuestras diferencias pero respetando siempre las opiniones
de cada uno; constuirmos un flujo de trabajo que nos llevó a
desarrollar soluciones sólidas con proyección para varios años y
esto siendo sinceros todas fueron ideas de Ger? o fueron ideas mías?
poco importa sinceramente, como les contaba constuimos un flujo de
laburo donde diseñamos y evaluamos multiples aleternativas y casuísticas
para luego implementar; al final del camino es realmente un trabajo
en equipo donde lo que prevalece es nuestra plataforma y por sobre
todo las personas que lo integran.

Ger querido, agradezco enormemente tu gratitud y apertura para
enseñarme una enorme cantidad de cosas, espero haberte dejado
marcas de las mías; es un orgullo y enorme placer haber construido
juntos esta plataforma y lo mas importante la amistad que
construimos y eso es para toda la vida ❤️!

Hasta la próxima 👋🏽
