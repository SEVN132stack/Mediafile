<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Http;

class SonarrService
{
    private function call(string $method, string $endpoint, array $body = []): array
    {
        $url = Setting::get('sonarr_url');
        $key = Setting::get('sonarr_api_key');
        if (!$url || !$key) throw new \Exception('Sonarr niet geconfigureerd');

        $req = Http::timeout(15)->withHeaders(['X-Api-Key' => $key]);
        $response = match ($method) {
            'GET'  => $req->get("{$url}/api/v3{$endpoint}"),
            'POST' => $req->post("{$url}/api/v3{$endpoint}", $body),
            'PUT'  => $req->put("{$url}/api/v3{$endpoint}", $body),
            default => throw new \Exception("Ongeldig method: {$method}"),
        };

        if (!$response->ok()) throw new \Exception("Sonarr {$response->status()}: " . substr($response->body(), 0, 200));
        return $response->json();
    }

    public function testConnection(): bool
    {
        try { $this->call('GET', '/system/status'); return true; } catch (\Exception) { return false; }
    }

    public function qualityProfiles(): array { return $this->call('GET', '/qualityprofile'); }
    public function rootFolders(): array     { return $this->call('GET', '/rootfolder'); }

    public function sendSeries(int $tmdbId, string $title, array $seasons = [], TmdbService $tmdb = null): array
    {
        // Zoek TVDB ID via TMDB
        $tvdbId = null;
        try {
            if ($tmdb) {
                $ext = $tmdb->externalIds('tv', $tmdbId);
                $tvdbId = $ext['tvdb_id'] ?? null;
            }
        } catch (\Exception) {}

        if (!$tvdbId) {
            try {
                $lookup = $this->call('GET', '/series/lookup?term=' . urlencode($title));
                $tvdbId = $lookup[0]['tvdbId'] ?? null;
            } catch (\Exception) {}
        }

        if (!$tvdbId) throw new \Exception('Kan TVDB ID niet vinden');

        // Check of al in Sonarr
        try {
            $all = $this->call('GET', '/series');
            $existing = collect($all)->firstWhere('tvdbId', $tvdbId);
            if ($existing) {
                if (!empty($seasons)) {
                    $updatedSeasons = collect($existing['seasons'])->map(fn($s) => [
                        ...$s, 'monitored' => in_array($s['seasonNumber'], $seasons)
                    ])->toArray();
                    $this->call('PUT', "/series/{$existing['id']}", [...$existing, 'seasons' => $updatedSeasons, 'monitored' => true]);
                    foreach ($seasons as $sn) {
                        try { $this->call('POST', '/command', ['name' => 'SeasonSearch', 'seriesId' => $existing['id'], 'seasonNumber' => $sn]); } catch (\Exception) {}
                    }
                    $label = count($seasons) > 1 ? 'Seizoenen ' . implode(', ', $seasons) : 'Seizoen ' . $seasons[0];
                    return ['status' => 'sent', 'message' => "{$label} worden gedownload", 'sonarr_id' => $existing['id']];
                }
                $done = ($existing['statistics']['percentOfEpisodes'] ?? 0) === 100;
                return $done
                    ? ['status' => 'available', 'message' => 'Serie volledig beschikbaar', 'sonarr_id' => $existing['id']]
                    : ['status' => 'downloading', 'message' => 'Serie wordt gedownload', 'sonarr_id' => $existing['id']];
            }
        } catch (\Exception) {}

        $profileId = (int) Setting::get('sonarr_quality_profile') ?: null;
        $rootFolder = Setting::get('sonarr_root_folder') ?: null;
        if (!$profileId) { $p = $this->call('GET', '/qualityprofile'); $profileId = $p[0]['id'] ?? null; }
        if (!$rootFolder) { $f = $this->call('GET', '/rootfolder'); $rootFolder = $f[0]['path'] ?? null; }

        $lookup = $this->call('GET', "/series/lookup?term=tvdb:{$tvdbId}");
        if (empty($lookup)) throw new \Exception('Serie niet gevonden in Sonarr');

        $seriesData = $lookup[0];
        $monitorOption = 'all';
        if (!empty($seasons)) {
            $monitorOption = 'none';
            $seriesData['seasons'] = collect($seriesData['seasons'] ?? [])->map(fn($s) => [
                ...$s, 'monitored' => in_array($s['seasonNumber'], $seasons)
            ])->toArray();
        }

        $series = $this->call('POST', '/series', [
            ...$seriesData,
            'qualityProfileId' => $profileId,
            'rootFolderPath'   => $rootFolder,
            'monitored'        => true,
            'seasonFolder'     => true,
            'addOptions'       => ['monitor' => $monitorOption, 'searchForMissingEpisodes' => true],
        ]);

        $label = !empty($seasons) ? (count($seasons) > 1 ? 'Seizoenen ' . implode(', ', $seasons) : 'Seizoen ' . $seasons[0]) : 'Alle seizoenen';
        return ['status' => 'sent', 'message' => "{$label} naar Sonarr gestuurd", 'sonarr_id' => $series['id']];
    }
}
