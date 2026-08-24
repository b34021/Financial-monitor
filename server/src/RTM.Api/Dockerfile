# syntax=docker/dockerfile:1

###############################################################################
# RTM.Api — multi-stage image
#
# Stage 1 (build): SDK compiles + publishes the backend.
# Stage 2 (runtime): tiny aspnet runtime image runs the published output.
#
# Build context = repo root (docker build -f server/src/RTM.Api/Dockerfile .)
# Exposed port: 8080 (the runtime image listens here; see appsettings/env).
###############################################################################

# ---- Stage 1: build ---------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first (layer caching: dependencies change less often than code).
COPY server/src/RTM.Domain/RTM.Domain.csproj src/RTM.Domain/
COPY server/src/RTM.Application/RTM.Application.csproj src/RTM.Application/
COPY server/src/RTM.Infrastructure/RTM.Infrastructure.csproj src/RTM.Infrastructure/
COPY server/src/RTM.Api/RTM.Api.csproj src/RTM.Api/
RUN dotnet restore server/src/RTM.Api/RTM.Api.csproj

COPY server/src/RTM.Domain/ src/RTM.Domain/
COPY server/src/RTM.Application/ src/RTM.Application/
COPY server/src/RTM.Infrastructure/ src/RTM.Infrastructure/
COPY server/src/RTM.Api/ src/RTM.Api/
RUN dotnet publish server/src/RTM.Api/RTM.Api.csproj -c Release -o /app/publish --no-restore

# ---- Stage 2: runtime -------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080

COPY --from=build /app/publish .

# Listen on 8080 inside the container (env overrides even the http profile).
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "RTM.Api.dll"]
